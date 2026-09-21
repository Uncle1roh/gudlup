/* ============================================================================
   Corporate Dashboard — shell (CORP-SHELL)

   Horizontal top navigation over a full-width content column, capped at
   1280px. The Therapist Workspace uses a sidebar because it navigates deep
   into one patient; this dashboard has six flat destinations and wants the
   width for charts and tables instead.

   Nav is IDENTICAL for both conventions. Every convention difference lives
   inside a screen — the Professional Support card on Overview, the Therapists
   tab in Management, step 4 of the setup wizard — so the shell never has to
   know which contract a tenant is on.

   The setup wizard gates everything: an unconfigured tenant has no company
   code to share and therefore nothing to show.

   Note on scope: the NR-1 psychosocial report is a separate regulatory surface
   with its own vocabulary and is intentionally NOT in this nav — this
   dashboard is a wellbeing-program dashboard, and NR-1 language ("risk",
   "exposure") is exactly what its vocabulary rules exclude.
   ============================================================================ */

import { useMemo, useState } from 'react'
import { useAuth, SignOutButton } from '../auth/auth'
import { useI18n } from '../i18n'
import { SetupWizard } from './Setup'
import { Overview, Engagement, Wellbeing, Reports } from './Screens'
import { Management } from './Management'
import { CompanyTherapists } from './CompanyTherapists'
import { Settings } from './Settings'
import { buildAggregates, useCorporateState } from './data'
import { cellValue, PERIODS, type PeriodId, type ReportRow } from './metrics'
import { BrandLogo } from '../components/Brand'

type Nav = 'overview' | 'engagement' | 'wellbeing' | 'reports' | 'therapists' | 'management' | 'settings'

/* ---- what this dashboard is FOR ----------------------------------------

   Four things, and the product owners were explicit that it is four:

     · anonymous, aggregate participation figures, with small groups
       suppressed so nobody can be identified;
     · no individual records, ever — which is a property of the data this
       screen receives, not a filter applied to it;
     · an activation code that puts a therapist on the company's list;
     · a panel to manage or remove the therapists on that list.

   Wellbeing trends, the PDF reports and the licence tables are NOT gone —
   they are behind this flag, code and all, because "not now" and "never"
   are different decisions and only one of them is reversible. Turning it on
   restores them; nobody has to rebuild them from the git history. */
const EXTRAS = false

const ALL_NAV: { id: Nav; label: string; extra?: boolean }[] = [
  { id: 'overview', label: 'Participation' },
  { id: 'therapists', label: 'Therapists' },
  { id: 'engagement', label: 'Engagement', extra: true },
  { id: 'wellbeing', label: 'Wellbeing', extra: true },
  { id: 'reports', label: 'Reports', extra: true },
  { id: 'management', label: 'Management', extra: true },
  { id: 'settings', label: 'Settings' },
]
const NAV = ALL_NAV.filter((n) => EXTRAS || !n.extra)

export function CorporateApp() {
  const { t } = useI18n()
  const { user } = useAuth()
  const { state, update } = useCorporateState()
  const [nav, setNav] = useState<Nav>('overview')
  const [period, setPeriod] = useState<PeriodId>('month')
  const [menu, setMenu] = useState(false)

  const agg = useMemo(() => buildAggregates(state), [state])
  const unread = state.reports.filter((r) => !r.viewed).length

  const adminName = state.profile.contactName || displayName(user?.email)

  if (!state.setupDoneAt) {
    return (
      <SetupWizard
        state={state}
        onDone={(patch) =>
          update((s) => ({
            ...s,
            ...patch,
            admins: s.admins.length
              ? s.admins
              : [{ id: 'owner', name: adminName, email: user?.email ?? '', role: 'owner', addedAt: Date.now() }],
          }))
        }
      />
    )
  }

  /** The file is built by the Reports screen; this clears the "NEW" badge
      and the Overview notification once it has been downloaded. */
  function markViewed(r: ReportRow) {
    update((s) => ({ ...s, reports: s.reports.map((x) => (x.id === r.id ? { ...x, viewed: true } : x)) }))
  }

  return (
    <div className="c-app">
      <header className="c-topbar">
        <div className="c-topbar__left">
          <span className="c-brand"><BrandLogo /></span>
          <span className="c-topbar__company">{state.profile.name}</span>
        </div>

        <nav className="c-nav" role="tablist">
          {NAV.map((n) => (
            <button key={n.id} role="tab" aria-selected={nav === n.id} onClick={() => setNav(n.id)}>
              {t(n.label)}
              {n.id === 'reports' && unread > 0 && <span className="c-navbadge">{unread}</span>}
            </button>
          ))}
        </nav>

        <div className="c-topbar__right">
          <button className="c-user" onClick={() => setMenu((v) => !v)} aria-expanded={menu}>
            <span className="c-avatar" aria-hidden="true">{initials(adminName)}</span>
            <span>{adminName}</span>
            <span aria-hidden="true">⌄</span>
          </button>
          {menu && (
            <div className="c-usermenu">
              <button className="c-usermenu__row" onClick={() => { setNav('settings'); setMenu(false) }}>{t('Profile')}</button>
              <a className="c-usermenu__row" href="mailto:support@goodloop.health">{t('Help')}</a>
              <SignOutButton className="c-usermenu__row" />
            </div>
          )}
        </div>
      </header>

      <main className="c-main">
        {(nav === 'overview' || nav === 'engagement' || nav === 'wellbeing') && (
          <div className="c-periodbar">
            <select className="c-input c-input--sm" value={period} onChange={(e) => setPeriod(e.target.value as PeriodId)}>
              {PERIODS.map((p) => <option key={p.id} value={p.id}>{t(p.label)}</option>)}
            </select>
          </div>
        )}

        {nav === 'overview' && (
          <Overview
            admin={adminName.split(' ')[0]}
            agg={agg}
            state={state}
            onOpenReports={() => setNav('reports')}
            onOpenManagement={() => setNav('management')}
          />
        )}
        {nav === 'engagement' && <Engagement agg={agg} />}
        {nav === 'wellbeing' && <Wellbeing agg={agg} />}
        {nav === 'reports' && (
          <Reports
            state={state}
            agg={agg}
            onGenerate={(r) => update((s) => ({ ...s, reports: [...s.reports, r] }))}
            onView={markViewed}
          />
        )}
        {nav === 'therapists' && (
          <CompanyTherapists companyId={state.companyCode || undefined} actor={user?.email ?? undefined} />
        )}
        {nav === 'management' && EXTRAS && <Management state={state} agg={agg} update={update} />}
        {nav === 'settings' && (
          <Settings state={state} registered={cellValue(agg.kpis.registered) ?? 0} update={update} />
        )}
      </main>
    </div>
  )
}

/* ------------------------------------------------------------------------- */

function displayName(email?: string | null): string {
  if (!email) return 'Admin'
  const local = email.split('@')[0]
  return local
    .split(/[._-]/)
    .map((p) => p.replace(/^./, (c) => c.toUpperCase()))
    .join(' ')
}

function initials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'GL'
}
