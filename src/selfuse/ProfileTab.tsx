/* ============================================================================
   Self Use — Profile

     menu          the rows below, Log Out, and the static line (SafetyLevel1)
     account       rectification (DAT-07): name, personal e-mail, country,
                   language, appearance
     notifications the reminder switches
     prefs         session preferences
     privacy       the optional consents, one toggle each, withdrawable
                   without closing the account (LEG-04/05); the sponsorship
                   line (SET-7); "Download your data" (SET-4, DAT-01) and
                   "Close account"
     delete        the export offer (SET-5) then the deletion with its
                   retention explanation (SET-6, DAT-06), armed by typing
     report        a content report or a complaint (Terms cl. 9 / cl. 19)
     tutorial      the explainer again
     help          support, report, Help now
     about         the legal information (Tier E: pull only)

   Every consent switch records an event with the wording the person saw
   through the legal context (server-side), and mirrors the four purposes the
   rest of the app reads into the local store. Nothing here is pre-ticked.
   ============================================================================ */

import { useEffect, useState } from 'react'
import { useI18n, LOCALES, type Locale } from '../i18n'
import { THEME_OPTIONS, readThemeChoice, setThemeChoice, type ThemeChoice } from './theme'
import { SafetyLevel1 } from './Safety'
import { DURATIONS, INTAKE_TIMES, durationLabel } from '../data/selfuse'
import type { SelfUseState } from '../data/selfUseStore'
import type { Duration } from '../types/domain'
import type { Convention } from '../data/convention'
import { useBackLayer } from './backStack'
import { useDataProvider } from '../data/provider'
import { useLegal } from '../legal/LegalContext'
import { LegalSheet } from '../legal/LegalPage'
import { HelpNowButton } from '../legal/HelpNow'
import { SUPPORTED_COUNTRIES, OTHER_COUNTRIES } from '../legal/market'
import { LEGAL_VERSION, type LegalDocId } from '../legal/types'
import type { ConsentPurpose, ReportKind } from '../legal/records'

interface ProfileProps {
  name: string
  email: string
  convention: Convention | null
  hasTherapist: boolean
  state: SelfUseState
  update: (fn: (s: SelfUseState) => SelfUseState) => void
  onLogout: () => void
  onDeleteAccount: () => void
  onExport: () => void
  onFindProfessional: () => void
}

type Page = 'menu' | 'account' | 'notifications' | 'prefs' | 'privacy' | 'tutorial' | 'help' | 'about' | 'delete' | 'report'

export function ProfileTab(props: ProfileProps) {
  const { t } = useI18n()
  const [page, setPage] = useState<Page>('menu')
  useBackLayer(page !== 'menu', () => setPage(page === 'delete' ? 'privacy' : page === 'report' ? 'help' : 'menu'))

  if (page !== 'menu') {
    const back = () => setPage('menu')
    return (
      <div className="su-page">
        <button className="su-back" onClick={back}>‹ {t('Back')}</button>
        {page === 'account' && <AccountSettings {...props} />}
        {page === 'notifications' && <NotificationSettings {...props} />}
        {page === 'prefs' && <SessionPrefs {...props} />}
        {page === 'privacy' && <PrivacyData {...props} onDelete={() => setPage('delete')} />}
        {page === 'tutorial' && <Tutorial hasTherapistConvention={props.convention?.type === 'self-use-plus'} onDone={back} />}
        {page === 'help' && <Help onReport={() => setPage('report')} />}
        {page === 'report' && <ReportForm onDone={() => setPage('help')} />}
        {page === 'about' && <About />}
        {page === 'delete' && <DeleteAccount onCancel={() => setPage('privacy')} onConfirm={props.onDeleteAccount} onExport={props.onExport} />}
      </div>
    )
  }

  const rows: { id: Page; label: string }[] = [
    { id: 'account', label: 'Account Settings' },
    { id: 'notifications', label: 'Notifications' },
    { id: 'prefs', label: 'Session Preferences' },
    { id: 'privacy', label: 'Privacy & Data' },
    { id: 'tutorial', label: 'How Good Loop Works' },
    { id: 'help', label: 'Help & Support' },
    { id: 'about', label: 'About Good Loop' },
  ]

  return (
    <div className="su-page profile">
      <h1 className="display su-h1">{t('Profile')}</h1>
      <div className="profile__id">
        <span className="avatar avatar--lg" aria-hidden="true">
          {props.name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('')}
        </span>
        <div>
          <strong>{props.name}</strong>
          <div className="small muted">{props.email}</div>
        </div>
      </div>

      <ul className="menu">
        {rows.map((r) => (
          <li key={r.id}>
            <button className="menu__row" onClick={() => setPage(r.id)}>
              <span>{t(r.label)}</span>
              <span aria-hidden="true">›</span>
            </button>
          </li>
        ))}
      </ul>

      <button className="btn btn--ghost" onClick={props.onLogout}>{t('Log Out')}</button>

      <SafetyLevel1 />
    </div>
  )
}

/* ------------------------------------------------------------------------- */

/** Rectification (DAT-07): what the person told us, editable by them. */
function AccountSettings({ name, email, convention }: ProfileProps) {
  const { t, locale, setLocale } = useI18n()
  const dp = useDataProvider()
  const legal = useLegal()
  const [theme, setTheme] = useState<ThemeChoice>(() => readThemeChoice())
  const [draftName, setDraftName] = useState(name)
  const [personalEmail, setPersonalEmail] = useState('')
  const [country, setCountry] = useState('')
  const [saved, setSaved] = useState<'idle' | 'saving' | 'done' | 'failed'>('idle')

  useEffect(() => {
    if (!legal.profile) return
    setDraftName(legal.profile.name || name)
    setPersonalEmail(legal.profile.personalEmail ?? '')
    setCountry(legal.profile.country ?? '')
  }, [legal.profile, name])

  async function save() {
    setSaved('saving')
    try {
      await dp.updateMyProfile({ name: draftName.trim() || name, personalEmail: personalEmail.trim() || null, country: country || undefined, locale })
      await legal.refresh()
      setSaved('done')
    } catch {
      setSaved('failed')
    }
  }

  return (
    <>
      <h2 className="display su-h1">{t('Account Settings')}</h2>
      <label className="ob-field">
        <span className="ob-field__label">{t('Name')}</span>
        <input className="ob-input" value={draftName} onChange={(e) => setDraftName(e.target.value)} autoComplete="name" />
      </label>
      <label className="ob-field">
        <span className="ob-field__label">{t('Email')}<em className="small muted"> · {t('sign-in address')}</em></span>
        <input className="ob-input" value={email} readOnly />
      </label>
      <label className="ob-field">
        <span className="ob-field__label">{t('Personal email')}</span>
        <input className="ob-input" type="email" value={personalEmail} onChange={(e) => setPersonalEmail(e.target.value)} autoComplete="email" placeholder={t('name@example.com')} />
        {convention && <span className="legal-consent__hint">{legal.m('ONB-4.3')}</span>}
      </label>
      <label className="ob-field">
        <span className="ob-field__label">{t('Where you live')}</span>
        <select className="ob-input" value={country} onChange={(e) => setCountry(e.target.value)}>
          <option value="">{t('Choose your country')}</option>
          {SUPPORTED_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label[locale]}</option>)}
          {OTHER_COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.label[locale]}</option>)}
        </select>
        <span className="legal-consent__hint">{legal.m('ONB-1.2')}</span>
      </label>
      <label className="ob-field">
        <span className="ob-field__label">{t('Linked company')}<em className="small muted"> · {t('locked')}</em></span>
        <input className="ob-input" value={convention?.companyName ?? t('Not linked')} readOnly />
      </label>
      <button className="btn btn--primary" disabled={saved === 'saving'} onClick={() => void save()}>
        {saved === 'saving' ? t('Saving…') : t('Save changes')}
      </button>
      {saved === 'done' && <p className="small muted">{t('Saved.')}</p>}
      {saved === 'failed' && <p className="ob-error">{t('Could not save just now. Try again in a moment.')}</p>}

      <label className="ob-field">
        <span className="ob-field__label">{t('Language')}</span>
        <select className="ob-input" value={locale} onChange={(e) => setLocale(e.target.value as Locale)}>
          {LOCALES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
        </select>
      </label>

      <div className="ob-field__label">{t('Appearance')}</div>
      <div className="chip-row">
        {THEME_OPTIONS.map((o) => (
          <button
            key={o.id}
            className="chip"
            aria-pressed={theme === o.id}
            onClick={() => { setTheme(o.id); setThemeChoice(o.id) }}
          >
            <span className="chip__label">{t(o.label)}</span>
          </button>
        ))}
      </div>
      <p className="small muted">{t('A session always plays on a dark screen, whichever you pick.')}</p>
    </>
  )
}

function NotificationSettings({ state, update, hasTherapist }: ProfileProps) {
  const { t } = useI18n()
  const n = state.notifications
  const set = (patch: Partial<typeof n>) => update((s) => ({ ...s, notifications: { ...s.notifications, ...patch } }))

  return (
    <>
      <h2 className="display su-h1">{t('Notifications')}</h2>
      <Toggle label={t('Self Use reminders')} on={n.selfUseReminder} onToggle={() => set({ selfUseReminder: !n.selfUseReminder })} />
      {n.selfUseReminder && (
        <label className="ob-field">
          <span className="ob-field__label">{t('Reminder time')}</span>
          <select className="ob-input" value={n.selfUseReminderTime} onChange={(e) => set({ selfUseReminderTime: e.target.value as typeof n.selfUseReminderTime })}>
            {INTAKE_TIMES.map((o) => <option key={o.id} value={o.id}>{t(o.label)}</option>)}
          </select>
        </label>
      )}
      <Toggle label={t('Weekly check-in reminder')} on={n.glCheck} onToggle={() => set({ glCheck: !n.glCheck })} />
      <Toggle label={t('Motivational nudges')} on={n.nudges} onToggle={() => set({ nudges: !n.nudges })} />
      {hasTherapist && (
        <>
          <Toggle label={t('Therapist session reminders')} on={n.therapistSessions} onToggle={() => set({ therapistSessions: !n.therapistSessions })} />
          <Toggle label={t('Reminders for sessions your therapist selected')} on={n.prescriptions} onToggle={() => set({ prescriptions: !n.prescriptions })} />
        </>
      )}
      <p className="small muted">{t('Each setting is independent. Reminders never contain health information.')}</p>
    </>
  )
}

function SessionPrefs({ state, update }: ProfileProps) {
  const { t } = useI18n()
  const p = state.prefs
  const set = (patch: Partial<typeof p>) => update((s) => ({ ...s, prefs: { ...s.prefs, ...patch } }))

  return (
    <>
      <h2 className="display su-h1">{t('Session Preferences')}</h2>
      <div className="ob-field__label">{t('Default duration')}</div>
      <div className="chip-row">
        {DURATIONS.map((d: Duration) => (
          <button key={d} className="chip" aria-pressed={p.defaultDuration === d} onClick={() => set({ defaultDuration: d })}>
            <span className="chip__label">{t(durationLabel(d))}</span>
            <span className="chip__hint">{d} min</span>
          </button>
        ))}
      </div>

      <label className="ob-field">
        <span className="ob-field__label">{t('Preferred time')}</span>
        <select className="ob-input" value={p.preferredTime} onChange={(e) => set({ preferredTime: e.target.value as typeof p.preferredTime })}>
          {INTAKE_TIMES.map((o) => <option key={o.id} value={o.id}>{t(o.label)}</option>)}
        </select>
      </label>

      <label className="ob-field">
        <span className="ob-field__label">{t('Audio quality')}</span>
        <select className="ob-input" value={p.audioQuality} onChange={(e) => set({ audioQuality: e.target.value as 'standard' | 'high' })}>
          <option value="standard">{t('Standard')}</option>
          <option value="high">{t('High')}</option>
        </select>
      </label>
    </>
  )
}

/* ------------------------------------------------------------ privacy ---- */

/** The optional purposes: label, and the consequence line the person sees
    (which is what the consent row records). Order matches the first run. */
const PURPOSES: { purpose: ConsentPurpose; label: string; note: string; local?: 'measurementAt' | 'aggregate' | 'notifications' | 'therapistBridge' }[] = [
  { purpose: 'measurement', label: 'Wellbeing check-ins', note: 'A short weekly self-report you can see back as your own history. Never scored, never compared to anything.', local: 'measurementAt' },
  { purpose: 'aggregate', label: 'Aggregate programme figures', note: 'Counted in totals for groups of 25 or more. Never shared individually.', local: 'aggregate' },
  { purpose: 'notifications', label: 'Reminders on this device', note: 'Reminders never contain health information.', local: 'notifications' },
  { purpose: 'therapist_bridge', label: 'Share Self Use history with your therapist', note: 'Your linked professional may see which sessions you listened to. Revocable anytime.', local: 'therapistBridge' },
  { purpose: 'marketing', label: 'News from Good Loop', note: 'Occasional product news by e-mail.' },
  { purpose: 'testimonial', label: 'Testimonials', note: 'An account of your experience may be published, with your name only if you say so.' },
  { purpose: 'research', label: 'Research on the methodology', note: 'De-identified use, only in research about how the sessions work.' },
]

function PrivacyData({ update, hasTherapist, convention, onExport, onDelete }: ProfileProps & { onDelete: () => void }) {
  const { t, d } = useI18n()
  const legal = useLegal()
  const [busy, setBusy] = useState<ConsentPurpose | null>(null)
  const [requested, setRequested] = useState(false)
  const [sheet, setSheet] = useState<LegalDocId | null>(null)

  async function flip(row: (typeof PURPOSES)[number]) {
    const next = !legal.consented(row.purpose)
    setBusy(row.purpose)
    try {
      await legal.setConsent(row.purpose, next, `${t(row.label)} — ${t(row.note)}`)
      /* Mirror into the local store for the flows that read it there. */
      if (row.local) {
        update((s) => {
          const now = Date.now()
          if (row.local === 'measurementAt') return { ...s, consents: { ...s.consents, measurementAt: next ? now : null } }
          const atField = `${row.local}At` as 'aggregateAt' | 'notificationsAt' | 'therapistBridgeAt'
          return { ...s, consents: { ...s.consents, [row.local as string]: next, [atField]: now } }
        })
      }
    } finally {
      setBusy(null)
    }
  }

  const rows = PURPOSES.filter((r) => r.purpose !== 'therapist_bridge' || hasTherapist)
    .filter((r) => r.purpose !== 'aggregate' || !!convention)

  return (
    <>
      <h2 className="display su-h1">{t('Privacy & Data')}</h2>
      <p className="lead">{legal.m('SET-3')}</p>

      <h3 className="home__sect">{t('Your choices')}</h3>
      {rows.map((row) => {
        const ev = legal.consents.filter((c) => c.purpose === row.purpose).sort((a, b) => b.at - a.at)[0]
        const hint = `${t(row.note)}${ev ? ` · ${t('Updated {date}', { date: d(ev.at, { day: 'numeric', month: 'short', year: 'numeric' }) })}` : ''}`
        return (
          <Toggle key={row.purpose} label={t(row.label)} hint={hint} on={legal.consented(row.purpose)} disabled={busy === row.purpose} onToggle={() => void flip(row)} />
        )
      })}

      <h3 className="home__sect">{t('What we hold on the contract')}</h3>
      <p className="small muted">{t('Your account, the sessions you play and your own notes are needed to provide the service; they are not a consent and cannot be switched off without closing the account.')}</p>

      {/* SET-7 — who pays, what they gave us, what they see (ONB-08). */}
      {convention && (
        <div className="profile__sponsor">
          <p>{legal.m('SET-7', { sponsor: convention.companyName, fields: (legal.profile?.sponsorFields ?? ['company code']).map((f) => t(f)).join(', ') })}</p>
          <button type="button" className="legal-link" onClick={() => setSheet('D-08')}>{t('Read the full notice')}</button>
        </div>
      )}

      <h3 className="home__sect">{t('Your data')}</h3>
      <p className="small muted">{t('Everything we hold about you, in a machine-readable copy with a note on each category. A request is logged and answered within fifteen days, in every country.')}</p>
      <button className="btn btn--ghost" onClick={() => { onExport(); setRequested(true) }}>{legal.m('SET-4')}</button>
      {requested && <p className="small muted">{t('Your copy is downloading. The request has been logged with the date it was received.')}</p>}
      <p className="small muted">
        {t('Your acceptances')}: {legal.acceptances.filter((a) => a.docId === 'terms').map((a) => `${a.version} · ${d(a.acceptedAt, { day: 'numeric', month: 'short', year: 'numeric' })}`).join(', ') || t('none recorded on this account yet')}
        {' · '}<button type="button" className="legal-link" onClick={() => setSheet('terms')}>{t('Terms')}</button>
        {' · '}<button type="button" className="legal-link" onClick={() => setSheet('privacy')}>{t('Privacy Notice')}</button>
      </p>
      <button className="btn btn--danger" onClick={onDelete}>{t('Close account')}</button>
      {sheet && <LegalSheet id={sheet} onClose={() => setSheet(null)} />}
    </>
  )
}

/* ------------------------------------------------------------- delete ---- */

/** SET-5 first — download everything you created — then SET-6, the deletion
    with its retention explanation, armed by typing (DAT-05, DAT-06). */
function DeleteAccount({ onCancel, onConfirm, onExport }: { onCancel: () => void; onConfirm: () => void; onExport: () => void }) {
  const { t } = useI18n()
  const legal = useLegal()
  const [typed, setTyped] = useState('')
  const [sheet, setSheet] = useState(false)
  const armed = typed.trim().toUpperCase() === 'DELETE'

  return (
    <>
      <h2 className="display su-h1">{t('Close your account?')}</h2>
      <div className="legal-note" role="note">
        <p className="legal-note__text">{legal.m('SET-5')}</p>
        <button type="button" className="legal-note__ok" onClick={onExport}>{t('Download')}</button>
      </div>
      <p className="lead">{legal.m('SET-6')}</p>
      <p className="small">
        <button type="button" className="legal-link" onClick={() => setSheet(true)}>{t('What we keep, and why')}</button>
      </p>
      <label className="ob-field">
        <span className="ob-field__label">{t('Type DELETE to confirm')}</span>
        <input className="ob-input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" autoCapitalize="characters" />
      </label>
      <button className="btn btn--danger" disabled={!armed} onClick={onConfirm}>{t('Delete account')}</button>
      <button className="btn btn--quiet" onClick={onCancel}>{t('Cancel')}</button>
      {sheet && <LegalSheet id="privacy" onClose={() => setSheet(false)} />}
    </>
  )
}

/* ------------------------------------------------------------- report ---- */

/** Terms cl. 9 (content) and cl. 19 (complaints): a report goes into the
    queue with the date it was received, and a person is told what happens
    next. */
function ReportForm({ onDone }: { onDone: () => void }) {
  const { t } = useI18n()
  const dp = useDataProvider()
  const [kind, setKind] = useState<ReportKind>('complaint')
  const [subject, setSubject] = useState('')
  const [location, setLocation] = useState('')
  const [reason, setReason] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')

  async function send() {
    setState('sending')
    try {
      await dp.createReport({ kind, subject: subject.trim(), location: location.trim() || undefined, reason: reason.trim() })
      setState('sent')
    } catch {
      setState('failed')
    }
  }

  if (state === 'sent') {
    return (
      <>
        <h2 className="display su-h1">{t('Thank you')}</h2>
        <p className="lead">{kind === 'content'
          ? t('We assess every report. Where it is well founded we remove or restrict the content and tell you what we did.')
          : t('We will confirm within two working days and reply within ten, telling you what we found and what we propose to do.')}</p>
        <button className="btn btn--primary" onClick={onDone}>{t('Done')}</button>
      </>
    )
  }

  return (
    <>
      <h2 className="display su-h1">{t('Report a problem')}</h2>
      <div className="chip-row" role="group" aria-label={t('What is this about?')}>
        <button className="chip" aria-pressed={kind === 'complaint'} onClick={() => setKind('complaint')}><span className="chip__label">{t('A complaint')}</span></button>
        <button className="chip" aria-pressed={kind === 'content'} onClick={() => setKind('content')}><span className="chip__label">{t('Content that should not be here')}</span></button>
      </div>
      <label className="ob-field">
        <span className="ob-field__label">{t('What is it about?')}</span>
        <input className="ob-input" value={subject} onChange={(e) => setSubject(e.target.value)} />
      </label>
      {kind === 'content' && (
        <label className="ob-field">
          <span className="ob-field__label">{t('Where is it? (a session name, a screen)')}</span>
          <input className="ob-input" value={location} onChange={(e) => setLocation(e.target.value)} />
        </label>
      )}
      <label className="ob-field">
        <span className="ob-field__label">{t('Tell us what happened')}</span>
        <textarea className="ob-input" rows={5} value={reason} onChange={(e) => setReason(e.target.value)} />
      </label>
      {state === 'failed' && <p className="ob-error">{t('Could not send just now. Try again in a moment.')}</p>}
      <button className="btn btn--primary" disabled={!subject.trim() || !reason.trim() || state === 'sending'} onClick={() => void send()}>
        {state === 'sending' ? t('Sending…') : t('Send')}
      </button>
    </>
  )
}

/* ------------------------------------------------------- the tutorial ---- */

const TUTORIAL = [
  {
    title: 'Why headphones matter',
    body: 'Good Loop uses stereo audio. Always use wired stereo headphones for the full experience.',
  },
  {
    title: 'What happens during a session',
    body: 'The screen goes dark by design. Close your eyes, listen, and let the audio do the work.',
  },
  {
    title: 'Your series',
    body: 'A series is a few weeks of sessions that follow on from each other. No pressure: go at your own speed.',
  },
  {
    title: 'Check-ins',
    body: 'A weekly check-in lives in the Progress tab. Less than a minute, and completely optional.',
  },
]

const TUTORIAL_THERAPIST = {
  title: 'Professional support',
  body: 'Where your plan includes it, a licensed professional can work with you in a video session and may select sessions for you to listen to on your own. They decide what is used and when; Good Loop provides the content and the tools.',
}

export function Tutorial({
  hasTherapistConvention,
  onDone,
}: {
  hasTherapistConvention: boolean
  onDone: () => void
}) {
  const { t } = useI18n()
  const screens = hasTherapistConvention ? [...TUTORIAL, TUTORIAL_THERAPIST] : TUTORIAL
  const [i, setI] = useState(0)
  const last = i === screens.length - 1

  return (
    <div className="tutorial">
      <button className="tutorial__skip" onClick={onDone}>{t('Skip')}</button>
      <div className="tutorial__art" aria-hidden="true"><span className="ob-art__glow" /></div>
      <h2 className="display su-h1">{t(screens[i].title)}</h2>
      <p className="lead">{t(screens[i].body)}</p>
      <div className="progress-dots">
        {screens.map((_, n) => <span key={n} className={n === i ? 'is-on' : ''} />)}
      </div>
      <button className="btn btn--primary" onClick={() => (last ? onDone() : setI(i + 1))}>
        {last ? t('Done') : t('Next')}
      </button>
    </div>
  )
}

/* ------------------------------------------------------------------------- */

function Help({ onReport }: { onReport: () => void }) {
  const { t } = useI18n()
  return (
    <>
      <h2 className="display su-h1">{t('Help & Support')}</h2>
      <ul className="menu">
        <li><a className="menu__row" href="mailto:support@goodloop.health"><span>{t('Contact support')}</span><span aria-hidden="true">›</span></a></li>
        <li><button className="menu__row" onClick={onReport}><span>{t('Report a problem')}</span><span aria-hidden="true">›</span></button></li>
      </ul>
      <p className="small muted">{t('In an emergency, Help now is always in the menu:')}</p>
      <HelpNowButton variant="inline" />
    </>
  )
}

function About() {
  const { t } = useI18n()
  const [sheet, setSheet] = useState<LegalDocId | null>(null)
  const docs: { id: LegalDocId; label: string }[] = [
    { id: 'terms', label: 'Terms and Conditions' },
    { id: 'privacy', label: 'Privacy Notice' },
    { id: 'D-02', label: 'Nature of the service' },
    { id: 'D-04', label: 'Self-guided use' },
    { id: 'D-06', label: 'Automated features' },
    { id: 'D-10', label: 'Confidentiality and data' },
    { id: 'D-16', label: 'Intellectual property' },
  ]
  return (
    <>
      <h2 className="display su-h1">{t('About Good Loop')}</h2>
      <p className="small muted">{t('Version')} 1.0 · {t('Legal texts')} {LEGAL_VERSION}</p>
      <p className="lead">
        {t('Good Loop combines guided voice, stereo sound design and structured audio segments into short relaxation sessions you can fit into a working day.')}
      </p>
      <a href="https://goodloop.health">goodloop.health</a>

      <h3 className="home__sect profile__legal">{t('Legal information')}</h3>
      <ul className="menu">
        {docs.map((dd) => (
          <li key={dd.id}><button className="menu__row" onClick={() => setSheet(dd.id)}><span>{t(dd.label)}</span><span aria-hidden="true">›</span></button></li>
        ))}
        <li><a className="menu__row" href="#legal" target="_blank" rel="noreferrer"><span>{t('All notices and previous versions')}</span><span aria-hidden="true">↗</span></a></li>
      </ul>
      {/* D-16 — the footer notice on every surface. */}
      <p className="small muted">{t('The Good Loop platform, its content and the GL Methodology are protected by copyright and other intellectual property rights.')}</p>
      {sheet && <LegalSheet id={sheet} onClose={() => setSheet(null)} />}
    </>
  )
}

function Toggle({ label, hint, on, onToggle, disabled }: { label: string; hint?: string; on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <div className="consent-row">
      <div className="consent-row__main">
        <div className="consent-row__text">
          <div className="consent-row__title">{label}</div>
          {hint && <span className="legal-consent__hint">{hint}</span>}
        </div>
        <button className={`switch${on ? ' is-on' : ''}`} role="switch" aria-checked={on} aria-label={label} onClick={onToggle} disabled={disabled}>
          <span className="switch__knob" />
        </button>
      </div>
    </div>
  )
}
