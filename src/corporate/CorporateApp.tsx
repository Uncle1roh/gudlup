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

import { useEffect, useMemo, useState } from 'react'
import { useAuth, SignOutButton } from '../auth/auth'
import { useI18n } from '../i18n'
import { useDataProvider } from '../data/provider'
import { normalizeCode, resolveCompanyCode } from '../data/convention'
import { LanguagePicker } from '../components/LanguagePicker'
import { SetupWizard } from './Setup'
import { Overview, Engagement, Wellbeing, Reports } from './Screens'
import { Management } from './Management'
import { CompanyTherapists } from './CompanyTherapists'
import { Settings } from './Settings'
import { buildAggregates, useCorporateState, FALLBACK_TENANT, tenantFromCode, tenantFromConvention, type Tenant } from './data'
import { cellValue, PERIODS, type PeriodId, type ReportRow } from './metrics'
import { BrandLogo } from '../components/Brand'
import { useLegal } from '../legal/LegalContext'
import { HelpNowButton } from '../legal/HelpNow'

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

/**
 * The company the signed-in account belongs to, from its company code.
 *
 * Null while it is being read, so the dashboard never paints one frame of a
 * company that is not the account's. In demo mode the stored profile is the
 * last sign-up's, so it only counts when it is THIS account's; otherwise the
 * demo user list (Admin → Utenti) says which company the address belongs to.
 */
function useTenant(): Tenant | null {
  const dp = useDataProvider()
  const { user, mode } = useAuth()
  const email = user?.email?.toLowerCase() ?? ''
  const [tenant, setTenant] = useState<Tenant | null>(null)

  useEffect(() => {
    let live = true
    void (async () => {
      let code: string | null = null
      try {
        const p = await dp.getMyLegalProfile()
        if (mode !== 'demo' || (p.email ?? '').toLowerCase() === email) code = p.companyId
      } catch { /* no profile row yet */ }
      if (!code && mode === 'demo' && email) {
        try {
          const users = await dp.listAdminUsers()
          code = users.find((u) => u.email.toLowerCase() === email)?.companyId ?? null
        } catch { /* not readable here */ }
      }
      let next: Tenant = FALLBACK_TENANT
      if (code) {
        const norm = normalizeCode(code)
        const conv = resolveCompanyCode(norm)
        if (conv) next = tenantFromConvention(conv)
        else {
          const known = await dp.listCompanies().then(
            (list) => list.find((c) => normalizeCode(c.id) === norm) ?? null,
            () => null,
          )
          next = tenantFromCode(norm, known)
        }
      }
      if (live) setTenant(next)
    })()
    return () => { live = false }
  }, [dp, mode, email])

  return tenant
}

export function CorporateApp() {
  const tenant = useTenant()
  if (!tenant) return <div className="c-setup" aria-busy="true" />
  return <Dashboard tenant={tenant} />
}

function Dashboard({ tenant }: { tenant: Tenant }) {
  const { t, locale } = useI18n()
  const { user } = useAuth()
  const { state, update } = useCorporateState(tenant)
  const [nav, setNav] = useState<Nav>('overview')
  const [period, setPeriod] = useState<PeriodId>('month')
  const [menu, setMenu] = useState(false)

  // locale: month labels and the renewal date are formatted inside
  const agg = useMemo(() => buildAggregates(state), [state, locale])
  const unread = state.reports.filter((r) => !r.viewed).length

  const adminName = state.profile.contactName || displayName(user?.email)

  /* SPN-07 — before anything else, once, logged: this service supports
     wellbeing and neither assesses workplace risk nor meets any legal
     obligation for the sponsor (D-09). Nothing in this console uses the
     statutory vocabulary that would let a buyer file it as a control. */
  const legal = useLegal()
  const [ack, setAck] = useState(false)
  const [ackBusy, setAckBusy] = useState(false)
  if (legal.loaded && legal.profile && !legal.accepted('D-09')) {
    return (
      <div className="c-setup">
        <div className="c-setup__card">
          <div className="c-brand"><BrandLogo /></div>
          <h1 className="c-h1">{t('Before you begin')}</h1>
          <p className="c-lead">{legal.m('SPC-1')}</p>
          <label className="c-checks legal-ack">
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} />
            <span>{t('I understand, on behalf of {company}.', { company: state.profile.name })}</span>
          </label>
          <p className="c-small">
            <a className="c-link" href="#legal/D-09" target="_blank" rel="noreferrer">{t('Read the full notice')}</a>
          </p>
          <div className="c-actions">
            <button className="c-btn c-btn--primary" disabled={!ack || ackBusy} onClick={() => { setAckBusy(true); void legal.accept('D-09').finally(() => setAckBusy(false)) }}>
              {t('Continue')}
            </button>
          </div>
        </div>
      </div>
    )
  }

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
          <HelpNowButton variant="inline" />
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
          <button className="c-user" onClick={() => setMenu((v) => !v)} aria-expanded={menu} aria-label={t('Account menu')}>
            <span className="c-avatar" aria-hidden="true">{initials(adminName)}</span>
            <span className="c-user__name">{adminName}</span>
            <span className="c-user__caret" aria-hidden="true">⌄</span>
          </button>
          {menu && (
            <div className="c-usermenu">
              <button className="c-usermenu__row" onClick={() => { setNav('settings'); setMenu(false) }}>{t('Profile')}</button>
              <a className="c-usermenu__row" href="mailto:support@goodloop.health">{t('Contact support')}</a>
              <div className="c-usermenu__lang"><LanguagePicker className="c-input c-input--sm" /></div>
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
            onOpenReports={EXTRAS ? () => setNav('reports') : undefined}
            onOpenManagement={EXTRAS ? () => setNav('management') : undefined}
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
