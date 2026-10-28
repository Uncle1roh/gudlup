/* ============================================================================
   Minha jornada — the panels ported from WJornada.dc.html

   Three of the mockup's four panels live here: the ring, the weeks, and how
   the sessions felt. The fourth — the check-in — is the app's own weekly
   check-in, and `ProgressTab` draws it beside the mood calendar and the
   other blocks the mockup does not know about, so that the screen is laid
   out in one place and reads as one screen.

   The LAYOUT is the mockup's. Everything in it is what the app already
   keeps, with the app's own words and the app's own arithmetic.

   Two numbers the mockup prints that this screen does not:

     · "0–10". The app's VAS is 1–5. The axis says what the scale is.
     · "+3,1 em média". An averaged delta handed back to the person is a
       scored outcome, and the WHO-5 snapshot was taken off this surface for
       exactly that reason (MN-05, Part VII.2). The two lines are the
       person's own history and stay that; nothing scores them.

   Each panel disappears when the thing behind it does not exist — there is
   no pathway for everybody, and no VAS without a therapist.
   ============================================================================ */

import { useI18n } from '../i18n'
import { useCatalog, findPathway } from '../data/liveCatalog'
import { weekCount, primaryBlock, type Pathway } from '../data/selfuse'
import { currentWeek, type PathwayState, type Launch } from '../data/selfUseStore'
import type { VasPoint } from '../selfuse/therapyStore'

/** The pathway the person is on, resolved against the live catalogue, with
    the week they are in. `null` when they are not on one. */
export function usePathwayView(pathway: PathwayState | null): { active: Pathway; week: number } | null {
  const catalog = useCatalog()
  const active = pathway ? findPathway(catalog.pathways, pathway.id) : undefined
  if (!pathway || !active) return null
  return { active, week: currentWeek(pathway, active) }
}

/* ---------------------------------------------- the ring and the weeks --- */

export function PathwayPanels({ pathway, active, week, onStart }: {
  pathway: PathwayState
  active: Pathway
  week: number
  onStart(l: Launch): void
}) {
  const { t } = useI18n()
  const thisWeek = active.plan.find((w) => w.week === week)
  const target = thisWeek ? weekCount(thisWeek) : 0
  const done = pathway.done[week] ?? 0
  const slug = thisWeek ? primaryBlock(thisWeek)?.slug : undefined
  const duration = thisWeek ? primaryBlock(thisWeek)?.duration : undefined

  return (
    <section className="g3">
      <article className="glass jr2-card jr2-ring">
        <Ring week={week} total={active.weeks} />
        <span className="jr2-focus">{thisWeek ? t(thisWeek.focus) : ''}</span>
        {target > 0 && (
          <span className="jr2-sub">{t('{done} of {total} this week', { done, total: target })}</span>
        )}
        {slug && duration && (
          <button type="button" className="call2-act" onClick={() => onStart({ slug, duration })}>
            <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor" /></svg>
            {t('Play')}
          </button>
        )}
      </article>

      <article className="glass jr2-card jr2-weeks s2">
        <h2 className="call2-pane__h">{t('The {n} weeks', { n: active.weeks })}</h2>
        <ol className="jr2-list">
          {active.plan.map((w) => {
            const state = w.week < week ? 'done' : w.week === week ? 'now' : 'ahead'
            return (
              <li key={w.week} className={`jr2-week jr2-week--${state}`}>
                <span className="jr2-n" aria-hidden="true">{w.week}</span>
                <span className="jr2-t">{t(w.focus)}</span>
                {state === 'done' && <span className="jr2-s">{t('Completed')}</span>}
                {state === 'now' && <span className="jr2-s jr2-s--now">{t('Now')}</span>}
              </li>
            )
          })}
        </ol>
      </article>
    </section>
  )
}

/* ------------------------------------------------------- how you felt --- */

export function VasPanel({ points, className = '' }: { points: VasPoint[]; className?: string }) {
  const { t } = useI18n()
  return (
    <article className={`glass jr2-card jr2-chart ${className}`}>
      <div className="call2-pane__top">
        <h2 className="call2-pane__h">{t('How you felt')}</h2>
        <span className="call2-note">{t('Before and after each session (1–5)')}</span>
      </div>
      <VasChart points={points} />
      <div className="jr2-key">
        <span><i className="jr2-key__after" aria-hidden="true" /> {t('After')}</span>
        <span><i className="jr2-key__before" aria-hidden="true" /> {t('Before')}</span>
      </div>
    </article>
  )
}

/* ------------------------------------------------------------- the ring --- */

function Ring({ week, total }: { week: number; total: number }) {
  const { t } = useI18n()
  const r = 50
  const c = 2 * Math.PI * r
  const pct = total > 0 ? Math.min(1, week / total) : 0

  return (
    <div className="jr2-dial">
      <svg viewBox="0 0 120 120" width="180" height="180" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--hair)" strokeWidth="10" />
        <circle
          cx="60" cy="60" r={r} fill="none" stroke="#3DB189" strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${(c * pct).toFixed(1)} ${c.toFixed(1)}`}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <span className="jr2-dial__n">{week}</span>
      <span className="jr2-dial__of">{t('of {n} weeks', { n: total })}</span>
    </div>
  )
}

/* ------------------------------------------------------------ the lines --- */

function VasChart({ points }: { points: VasPoint[] }) {
  const rows = [...points].sort((a, b) => a.at - b.at).slice(-14)
  const W = 560
  const H = 150
  const pad = 10
  const x = (i: number) => pad + (i * (W - pad * 2)) / Math.max(1, rows.length - 1)
  /* The VAS runs 1–5; the band is drawn to that, not to a guessed range. */
  const y = (v: number) => H - pad - ((v - 1) / 4) * (H - pad * 2)
  const line = (key: 'pre' | 'post') => rows.map((r, i) => `${x(i).toFixed(1)},${y(r[key]).toFixed(1)}`).join(' ')

  return (
    <svg className="jr2-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-hidden="true">
      <polyline points={line('post')} fill="none" stroke="#3DB189" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <polyline points={line('pre')} fill="none" stroke="#E89D64" strokeWidth="2.5" strokeDasharray="7 6" strokeLinejoin="round" strokeLinecap="round" />
      <line x1={pad} y1={H - pad} x2={W - pad} y2={H - pad} stroke="var(--hair)" strokeWidth="1" />
    </svg>
  )
}
