/* ============================================================================
   Self Use — the app shell

   Five tabs, always visible EXCEPT during an active session (the immersive
   player) or an active videocall. No badge counts on any tab, and the
   Therapist tab is shown to everyone — what varies is what is inside it.

   The shell owns two things the tabs must not each re-derive:
   · the onboarding gate,
   · the session launcher (which decides whether a finished session ticks off a
     pathway week, a selected session, or neither).

   What it no longer owns: a "Safety Gateway Level 2" that watched the
   check-in and mood series and opened a sheet saying "we've noticed things
   have felt heavier". A notice triggered by what a person entered or rated is
   an output about that person — the behaviour that pulls a wellbeing product
   inside the medical-device definition (Feature Register MN-03, MN-19; Part
   VII.4 of the Terms deliverable). The route to help is the Help now button,
   on every screen, for everyone, always: static, never inferred.
   ============================================================================ */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/auth'
import { FeatureOff } from '../app/FeatureOff'
import { useFeature } from '../app/useFeature'
import { useDataProvider } from '../data/provider'
import { useI18n } from '../i18n'
import { Explore } from './Explore'
import { FirstRun } from './FirstRun'
import { AddressedAsGate } from './AddressedAsGate'
import { SessionFlow, type SessionOutcome } from './Session'
import { TherapistTab } from './TherapistTab'
import { ProgressTab } from './ProgressTab'
import { ProfileTab } from './ProfileTab'
import { BenefitsTab } from './BenefitsTab'
import { GlCheckFlow, DailyMoodFlow } from './Measures'
import { SafetyLevel3 } from './Safety'
import { HelpNowButton } from '../legal/HelpNow'
import { useLegal } from '../legal/LegalContext'
import { buildDataExport } from '../legal/dataExport'
import { PatientVideoCall } from './VideoCall'
import { useSelfUseStore, takeSignupIntake, type Launch } from '../data/selfUseStore'
import { accountName, displayName } from './greeting'
import { useTherapyStore, linkFromServer, profileFor } from './therapyStore'
import { previewing, PREVIEW_USER_ID } from '../admin/preview'
import { resolveCompanyCode, hasProfessionalSupport } from '../data/convention'
import { LiveCatalogProvider, useCatalog, findPathway } from '../data/liveCatalog'
import { Icon, type IconName } from './icons'
import { buildMonthlyReportPdf, buildTherapyReportPdf } from './progressPdf'
import { weekCount, SELF_USE_SESSIONS, type PathwayId } from '../data/selfuse'
import { useAssessments, vasRecord, SELF_USE_PATIENT_ID } from '../data/assessmentStore'
import { dayKey } from '../data/measures'
import type { Appointment } from '../data/scheduling'
import type { Duration } from '../types/domain'
import { BrandLogo } from '../components/Brand'
import { useSuTheme } from './theme'
import { useBackLayer } from './backStack'
import { UnlockSheet } from './UnlockSheet'
import { unseenUnlocks, type AchievementView } from '../gamification/achievements'
import { pickHomeChallenge, type ChallengeView } from '../gamification/challenges'
import { ChallengeCard } from './ChallengeCard'
import { ChallengeDetail } from './ChallengeDetail'

/* Home IS the library. There is no separate Explore tab: the rails, the
   pathways and the continue card are one screen, because a person opening the
   app wants to choose something, and a Home that only linked to the place
   where you choose was a hop with nothing in it. */
type Tab = 'home' | 'therapist' | 'progress' | 'benefits' | 'profile'

const TABS: { id: Tab; icon: IconName; label: string }[] = [
  { id: 'home', icon: 'library', label: 'Home' },
  { id: 'therapist', icon: 'therapist', label: 'Therapist' },
  { id: 'progress', icon: 'progress', label: 'Progress' },
  /* Benefits (docs/gamification/SPEC.md §6) — where the partner offers were,
     for everyone: care that comes back to you, exchanged for Loops. */
  { id: 'benefits', icon: 'loop', label: 'Benefits' },
  { id: 'profile', icon: 'profile', label: 'Profile' },
]

type Overlay =
  | { kind: 'none' }
  | { kind: 'glcheck' }
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
      {/* One tap from every screen — the first run, the player, a call, every
          tab (CRS-01). It used to float over the surface as a direct child of
          #root, where `#root > * { width: 100% }` stretched it across the
          screen and it sat on top of the primary buttons. It is now a slim
          bar ABOVE whatever the surface shows, in the flow, so it can never
          cover a control; on a desk the tab bar is at the top and carries it
          instead (see `.su-shell` in legal.css). */}
      <div className="su-shell">
        <div className="su-shell__bar su-studio">
          <HelpNowButton variant="bar" />
        </div>
        <SelfUseSurface {...props} />
      </div>
    </LiveCatalogProvider>
  )
}

function SelfUseSurface({ demoSeconds = null, onDemoToggle }: SelfUseAppProps) {
  const { t } = useI18n()
  /* The only thing in the app that reads the theme: the logo is a PNG in two
     colourways and CSS cannot repaint it. */
  const theme = useSuTheme()
  const catalog = useCatalog()
  const { user, role, signOut } = useAuth()
  const dp = useDataProvider()
  const legal = useLegal()
  /* In an admin's preview the local state is keyed to the preview, not to
     whoever is signed in: a sales walkthrough must not write itself into the
     admin's own Self Use record, and must not read one either. */
  const storeId = previewing() ? PREVIEW_USER_ID : user?.id
  const { state, update, reset } = useSelfUseStore(storeId)
  const { update: updateAssessments } = useAssessments()
  const { state: therapy, update: updateTherapy } = useTherapyStore(storeId)

  const [tab, setTab] = useState<Tab>('home')
  /* Tapping the tab you are already on takes that tab back to its root, the
     way a phone's tab bar does: the Therapist tab left on "Find a therapist"
     used to stay there however often its tab was tapped. The counter keys the
     tab's view, so a re-tap remounts it at its first screen (and at the top). */
  const [tabReset, setTabReset] = useState(0)
  const selectTab = (id: Tab) => {
    if (id === tab) setTabReset((n) => n + 1)
    else setTab(id)
  }
  /* The Partner tab is for admin accounts only while the offers are being
     put together — an admin reaches it through the console's preview. Any
     other account never sees the tab, and cannot land on it. */
  const tabs = TABS
  /* One search, shared by the top bar and the library's own header, so a
     query typed in either place is the same query. */
  const [query, setQuery] = useState('')
  const [launch, setLaunch] = useState<(Launch & { prescriptionId?: string }) | null>(null)
  const [overlay, setOverlay] = useState<Overlay>({ kind: 'none' })
  const videoOn = useFeature('video')

  /* The browser's back, one layer at a time (see backStack.ts). Registered in
     the order they can open, so the most recent is the one a press reaches.

     A tab other than Home goes back to Home, the way a phone's tab bar does:
     tabs are siblings, not a stack, so Profile → Progress → back is Home, not
     Profile. A sheet on top of a tab closes. A videocall is the exception — it
     has its own Leave, and a stray back gesture must not hang up on a
     therapist, so while a call is up the back is caught and does nothing. */
  useBackLayer(tab !== 'home', () => setTab('home'))
  useBackLayer(overlay.kind !== 'none', () => {
    if (overlay.kind === 'call') return
    setOverlay({ kind: 'none' })
  })

  /* Achievements unlocked since the app was last opened (SPEC §3.4). Read
     when the app opens and when it comes back to the foreground — never
     when a session ends: the post-session screen keeps its one metric and
     two actions (GAM-R6), and the sheet only ever opens over Home. */
  const [unlocks, setUnlocks] = useState<AchievementView[]>([])
  const [progressView, setProgressView] = useState<'summary' | 'achievements'>('summary')
  useEffect(() => {
    let alive = true
    const check = () => {
      if (document.visibilityState !== 'visible') return
      void dp.listMyAchievements()
        .then((rows) => { if (alive) setUnlocks(unseenUnlocks(rows)) })
        .catch(() => { /* offline — they wait for the next open */ })
    }
    check()
    document.addEventListener('visibilitychange', check)
    return () => { alive = false; document.removeEventListener('visibilitychange', check) }
  }, [dp, storeId])
  const closeUnlocks = () => {
    const ids = unlocks.map((a) => a.id)
    setUnlocks([])
    if (ids.length) void dp.markAchievementsSeen(ids).catch(() => { /* shown again next open */ })
  }
  const unlockSheetUp = unlocks.length > 0 && tab === 'home' && !launch && overlay.kind === 'none'
  useBackLayer(unlockSheetUp, closeUnlocks)

  /* Challenges (SPEC §5.5): read when the app opens and again after a
     session, for the one card on Home and its detail. */
  const [challenges, setChallenges] = useState<ChallengeView[]>([])
  const [challengeOpen, setChallengeOpen] = useState<string | null>(null)
  const loadChallenges = useCallback(() => {
    void dp.listMyChallenges().then(setChallenges).catch(() => setChallenges([]))
  }, [dp])
  useEffect(() => { loadChallenges() }, [loadChallenges, storeId])
  useBackLayer(challengeOpen !== null, () => setChallengeOpen(null))
  const homeChallenge = pickHomeChallenge(challenges, Date.now())
  const openChallenge = challenges.find((c) => c.id === challengeOpen) ?? null

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
  /* Asked once, and remembered on the ACCOUNT: somebody who answered on their
     phone is not asked again on a laptop. */
  useEffect(() => {
    if (state.addressedAs) return
    let alive = true
    void dp.getMyAddressedAs()
      .then((to) => {
        if (!alive || !to) return
        update((s) => (s.addressedAs ? s : { ...s, addressedAs: to }))
      })
      .catch(() => { /* offline: the gate asks, and writing it back retries */ })
    return () => { alive = false }
  }, [dp, state.addressedAs, update])

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
      addressedAs: signup?.addressedAs ?? s.addressedAs,
      consents: {
        ...s.consents,
        usageAt: s.consents.usageAt ?? now,
        measurementAt: signup ? (signup.measurement ? now : null) : s.consents.measurementAt,
      },
    }))
  }, [state.onboardedAt, update])

  /* ----------------------------------------------------- the first run ---

     What the app IS, once, before anything else. Registration hands a person
     straight to a shelf of covers, and a shelf only works for someone who
     already knows what is on it — the POs' report was people opening Good
     Loop and not knowing what it does.

     Three cards answer that and then never appear again: `tutorialSeenAt` is
     stamped whether they read it or skip it, and it is stored with the rest
     of the person's state (per account, on this device, like `onboardedAt`).
     Profile → "How Good Loop Works" is where it lives from then on. */
  /* The acceptance lives server-side (LEG-01): a person who accepted the
     current version on another device is not asked again here, and one who
     accepted an OLDER version is (LEG-09). The local stamp is only a mirror
     for the device. Until the legal context has answered, nothing is shown
     rather than a screen that might be wrong. */
  /* An admin's preview runs on the mock data layer, which has no acceptance
     row for anybody, so the server-side check could never pass and the
     walkthrough opened on the legal first run instead of the library. The
     preview's seeded state carries its own `termsAt`; in preview (and only
     there — `previewing()` is an admin-only, per-tab flag) that stamp is
     enough. A real first-time person still sees the first run. */
  const termsAccepted = legal.accepted('terms')
    || (!legal.loaded && !!state.consents.termsAt)
    || (previewing() && role === 'admin' && !!state.consents.termsAt)
  if (legal.loaded && legal.profile && legal.accepted('terms') && !state.consents.termsAt) {
    update((s) => ({ ...s, consents: { ...s.consents, termsAt: Date.now() } }))
  }
  if (!termsAccepted || !state.tutorialSeenAt) {
    if (!legal.loaded) return <div className="app-frame su-studio" />
    return (
      <FirstRun
        hasCompanyCode={!!convention}
        sponsorName={convention?.companyName}
        professional={hasProfessionalSupport(convention)}
        needsTerms={!termsAccepted}
        needsTutorial={!state.tutorialSeenAt}
        onAcceptTerms={() => update((s) => ({ ...s, consents: { ...s.consents, termsAt: Date.now() } }))}
        onDone={() => update((s) => ({ ...s, tutorialSeenAt: Date.now() }))}
      />
    )
  }

  /* Accounts from before the female recordings existed have no answer, and
     there is no default worth guessing — "male" is what they have silently
     been getting. Asked once, then never again. */
  if (!state.addressedAs) {
    return (
      <AddressedAsGate
        onChoose={(to) => {
          update((s) => ({ ...s, addressedAs: to }))
          void dp.setMyAddressedAs(to).catch(() => { /* retried by the hydrate above */ })
        }}
      />
    )
  }

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
          /* The gate above guarantees an answer; 'm' is only the type's
             floor, never a silent default anybody actually hears. */
          addressedAs={state.addressedAs ?? 'm'}
          needsStereoCheck={!state.stereoCheckedAt}
          contextLine={context}
          demoSeconds={demoSeconds}
          /* Only a PASS retires the check. Recording a failure as a pass meant
             someone on a mono Bluetooth earpiece was never asked again. */
          onStereoChecked={(passed) => { if (passed) update((s) => ({ ...s, stereoCheckedAt: Date.now() })) }}
          onCancel={() => setLaunch(null)}
          onNeedSupport={() => { setLaunch(null); setOverlay({ kind: 'safety3' }) }}
          /* PLY-4: the end of every self-guided session links to a
             professional — the Therapist tab, which is also the way into
             professionally guided use (M1-06). */
          onFindProfessional={() => { setLaunch(null); setTab('therapist') }}
          onDone={(o) => { void finishSession(o) }}
        />
      )
    }
  }

  async function finishSession(o: SessionOutcome) {
    const l = launch
    setLaunch(null)
    /* Ended early: the minutes actually heard still count, at a reduced rate
       — no completion bonus (docs/gamification/SPEC.md §2.2, PLAN A24). It
       goes to the server only: the local log, the pathway, the "recent"
       shelf and the VAS stay what they were, completed sessions only. Under
       a minute there is nothing to credit, so nothing is sent. */
    if (!o.completed) {
      const s = catalog.sessions.find((x) => x.slug === o.slug)
      if (s && o.listenedSec >= 60) {
        await dp.recordSession({
          id: `s-${o.startedAt}`, protocolCode: s.protocolCode, duration: o.duration,
          startedAt: o.startedAt, completedAt: o.endedAt, completed: false,
          listenedSec: o.listenedSec, stereoChecked: o.stereoChecked,
        }).catch(() => { /* offline — nothing else depends on it */ })
        loadChallenges()
      }
      return
    }

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
          completedAt: o.endedAt,
          completed: true,
          listenedSec: o.listenedSec,
          stereoChecked: o.stereoChecked,
        })
        .catch(() => { /* offline — the local log below still holds */ })
    }

    /* The same completion test the update below makes, read from the state
       this session started from, so the server hears of a pathway the moment
       it is finished — and only then: pathways finished before this build
       never reach it, which is what keeps achievements from paying out
       retroactively. Outside the updater, because an updater must not have
       side effects. */
    if (!l?.prescriptionId && l?.pathwayWeek && state.pathway && !state.pathway.completedAt) {
      const p = findPathway(catalog.pathways, state.pathway.id)
      const done = { ...state.pathway.done, [l.pathwayWeek]: (state.pathway.done[l.pathwayWeek] ?? 0) + 1 }
      if (p && p.plan.every((w) => (done[w.week] ?? 0) >= weekCount(w))) {
        void dp.recordPathwayCompleted(p.id).catch(() => { /* offline — the pathway is still finished locally */ })
      }
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
    loadChallenges()
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
    /* Gated HERE and not inside the component: PatientVideoCall opens the
       camera and the peer connection from its own hooks, so a switch read
       after they have run would have started the very thing it is meant to
       stop. */
    if (!videoOn) {
      return <FeatureOff area="video" onBack={() => { setOverlay({ kind: 'none' }); setTab('therapist') }} />
    }
    return (
      <PatientVideoCall
        addressedAs={state.addressedAs ?? 'm'}
        therapist={therapy.link.therapist}
        startsAt={appointment?.startsAtMs ?? therapy.link.nextSessionAt}
        roomId={appointment?.id ?? null}
        appointmentId={appointment?.id ?? null}
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
      personName: accountName(user?.email),
      t,
    }).save(`good-loop-${dayKey(Date.now())}.pdf`)
  }

  function exportTherapy() {
    if (!therapy.link) return
    buildTherapyReportPdf(therapy.link, catalog.sessions, accountName(user?.email), t)
      .save(`good-loop-therapy-${dayKey(Date.now())}.pdf`)
  }

  /**
   * The data-subject request (DAT-01, DAT-02): a request row with a 15-day
   * clock, and the machine-readable copy itself, in the twelve domains of
   * the DSR specification with an express nil for each domain that holds
   * nothing — the statement that no score or risk classification exists is
   * the most valuable sentence in the package (DSR spec 3.3). A
   * professional's clinical record is NOT here: it is routed, not refused
   * (4.3), and the file says who holds it.
   */
  async function exportRawData() {
    let requestId: string | null = null
    try {
      const req = await dp.createDataRequest('portability')
      requestId = req.id
    } catch { /* offline — the copy is still produced */ }
    const [acceptances, consents, wallet, loops] = await Promise.all([
      dp.listMyAcceptances().catch(() => []),
      dp.listMyConsents().catch(() => []),
      dp.getWallet().catch(() => null),
      dp.listLoopsLedger().catch(() => null),
    ])
    const pkg = buildDataExport({
      requestId,
      profile: legal.profile,
      email: user?.email ?? null,
      companyCode: state.companyCode,
      acceptances,
      consents,
      state,
      sessions: catalog.sessions,
      therapy: therapy.link
        ? {
            therapistName: therapy.link.therapist.name,
            sessions: therapy.link.sessions,
            selected: therapy.link.prescriptions,
          }
        : null,
      gamification: wallet && loops ? { wallet, loops } : null,
    })
    downloadJson(`good-loop-my-data-${dayKey(Date.now())}.json`, pkg)
  }

  /** DAT-06: the person's rows and login go; the local mirror goes with them. */
  async function deleteAccount() {
    try { await dp.deleteMyAccount() } catch { /* the server refused — nothing local is wiped either */ return }
    reset()
    void signOut()
  }

  return (
    <div className="app-frame app-frame--tabs su-studio">
      <div className="tabview" key={`${tab}:${tabReset}`}>
        {tab === 'home' && openChallenge && (
          <ChallengeDetail c={openChallenge} onBack={() => setChallengeOpen(null)} onStart={() => setChallengeOpen(null)} />
        )}
        {tab === 'home' && !openChallenge && (
          <Explore
            topCard={homeChallenge ? <ChallengeCard c={homeChallenge} onOpen={() => setChallengeOpen(homeChallenge.id)} /> : null}
            name={displayName(user?.email)}
            pathway={state.pathway}
            completed={state.completedPathways.map((c) => c.id)}
            onStartPathway={startPathway}
            onStart={startFromExplore}
            query={query}
            onQuery={setQuery}
            sponsored={!!convention}
            professionalOffered={hasProfessionalSupport(convention)}
            onFindProfessional={() => setTab('therapist')}
            /* Completed sessions, newest first, one entry per session. Not
               "continue listening": nothing is logged here when a session is
               ended early, so there is no position to resume — this is the
               honest version of that shelf, built from data that exists. */
            recent={[...new Set([...state.logs].sort((a, b) => b.at - a.at).map((l) => l.slug))].filter(Boolean).slice(0, 12)}
            saved={state.saved}
            onToggleSave={(slug) => update((s) => ({
              ...s,
              /* Newest first, so the rail reads as a list being built rather
                 than whatever order the library happens to be in. */
              saved: s.saved.includes(slug) ? s.saved.filter((x) => x !== slug) : [slug, ...s.saved],
            }))}
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
            view={progressView}
            onView={setProgressView}
            onGlCheck={() => setOverlay({ kind: 'glcheck' })}
            onMood={() => setOverlay({ kind: 'mood' })}
            onGoTherapist={() => setTab('therapist')}
            onExportSelfUse={exportSelfUse}
            onExportTherapy={exportTherapy}
          />
        )}

        {tab === 'benefits' && (
          <BenefitsTab
            onStartSession={() => setTab('home')}
            onSeeAchievements={() => { setProgressView('achievements'); setTab('progress') }}
          />
        )}

        {tab === 'profile' && (
          <ProfileTab
            name={accountName(user?.email)}
            email={user?.email ?? ''}
            convention={convention}
            hasTherapist={Boolean(therapy.link)}
            state={state}
            update={update}
            onLogout={() => void signOut()}
            onDeleteAccount={() => void deleteAccount()}
            onExport={() => void exportRawData()}
            onFindProfessional={() => setTab('therapist')}
          />
        )}
      </div>

      {unlockSheetUp && (
        <UnlockSheet
          queue={unlocks}
          onSeeAll={() => { closeUnlocks(); setProgressView('achievements'); setTab('progress') }}
          onClose={closeUnlocks}
        />
      )}

      <nav className={`tabbar${tabs.length > 4 ? ' tabbar--5' : ''}`}>
        {/* The wordmark was a `::before` on this nav — fine while it was
            decoration, wrong the moment anything had to sit next to it. It is
            an element now so the search field can stand between it and the
            tabs, which is where the desktop layout has room for one. Both are
            hidden at phone widths, where this nav is four icons at the foot
            of the screen and the search lives in the library's own header. */}
        <span className="tabbar__brand">
          <BrandLogo variant={theme === 'light' ? 'green' : 'cream'} />
        </span>

        <label className="su-search su-search--bar">
          <Icon name="search" size={16} />
          <input
            type="search"
            value={query}
            placeholder={t('Search sessions')}
            aria-label={t('Search sessions')}
            /* Searching is a thing you do to the library, so it takes you
               there rather than filtering a screen you cannot see. */
            onChange={(e) => { setQuery(e.target.value); if (e.target.value) setTab('home') }}
          />
        </label>

        {tabs.map((tb) => (
          <button key={tb.id} className={`tabbar__btn${tab === tb.id ? ' is-on' : ''}`} onClick={() => selectTab(tb.id)} aria-current={tab === tb.id ? 'page' : undefined}>
            <span className="tabbar__icon"><Icon name={tb.icon} /></span>
            <span className="tabbar__label">{t(tb.label)}</span>
          </button>
        ))}

        {/* The desk layout's copy of Help now: the top bar is where the
            shell's strip would otherwise stand, so it moves in here. Hidden
            below 1100px, where the strip above the frame carries it. */}
        <HelpNowButton variant="bar" className="tabbar__help" />
      </nav>

      {onDemoToggle && (
        <button className="dev-toggle su-dev" onClick={onDemoToggle}>
          {demoSeconds ? t('demo {n}s', { n: demoSeconds }) : t('full length')}
        </button>
      )}

    </div>
  )
}

/* ------------------------------------------------------------------------- */


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
