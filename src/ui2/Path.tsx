/* ============================================================================
   Percurso — what the therapist chose for this person

   Its own destination now. It used to sit at the foot of Terapia, under
   everything else on that screen, which is the wrong place for the one list
   a person is actually asked to work through.

   The layout is the mockup's (Protocolos.dc.html): a tinted theme square, the
   name, one line about it, and a cream play disc. The CONTENT is the app's
   and does not change — the sessions a clinician selected, at the length
   they set, with the count the app already keeps. Three columns on a desk,
   one on a phone.

   Two things the mockup has that this screen does not:

     · the Rápida / Padrão / Profunda chooser. A prescription has ONE length,
       set by the professional. Offering three would let a person quietly
       answer a different prescription than the one they were given, so the
       length is printed, not picked.
     · a search field. This is a handful of items a clinician chose, not a
       library to look through.
   ============================================================================ */

import type { Duration } from '../types/domain'
import { useI18n } from '../i18n'
import { useLegal } from '../legal/LegalContext'
import { durationLabel } from '../data/selfuse'
import { useCatalog } from '../data/liveCatalog'
import { THEME_ICON, THEME_TINT } from './theme'
import { TopBar, PageTitle } from './TopBar'

/** The display shape TherapistTab already built; nothing here recomputes it. */
export interface PrescriptionView {
  id: string
  slug: string
  duration: Duration
  perWeek: number
  done: number
  total: number
  status: 'active' | 'completed'
}

export function Path({ name, therapistName, prescriptions, onStart }: {
  name: string | null
  therapistName: string | null
  prescriptions: PrescriptionView[]
  onStart(slug: string, duration: Duration, prescriptionId: string): void
}) {
  const { t } = useI18n()
  const { m } = useLegal()
  const catalog = useCatalog()

  return (
    <>
      <TopBar name={name} />
      <PageTitle
        title={t('My path')}
        /* SES-6 — the professional selected this; the platform never
           suggests, orders or pre-fills a selection (M2P-10). */
        note={therapistName ? m('SES-6', { name: therapistName }) : undefined}
      />

      {!prescriptions.length && (
        <p style={{ margin: 0, fontSize: 15, color: 'var(--ink-2)' }}>{t('Nothing selected yet.')}</p>
      )}

      <section className="g3">
        {prescriptions.map((rx) => {
          const s = catalog.sessions.find((x) => x.slug === rx.slug)
          if (!s) return null
          /* Offer Play only when the session can actually be started at the
             prescribed length. A protocol a PO disabled this morning, or a
             length that was never rendered, used to open anyway and play the
             placeholder bed under a clinical prescription. */
          const playable = s.available && s.durations.includes(rx.duration)
          const pct = Math.min(100, Math.round((rx.done / Math.max(1, rx.total)) * 100))

          return (
            <article key={rx.id} className="glass path2-card">
              <div className="path2-top">
                <span className="path2-icon" style={{ background: THEME_TINT[s.theme] }} aria-hidden="true">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={THEME_ICON[s.theme]} />
                  </svg>
                </span>

                <div className="path2-id">
                  <span className="path2-name">{t(s.name)}</span>
                  <span className="path2-desc">{t(s.blurb)}</span>
                </div>

                {playable && rx.done < rx.total && (
                  <button
                    type="button"
                    className="path2-play"
                    aria-label={t('Play')}
                    onClick={() => onStart(rx.slug, rx.duration, rx.id)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4l13 8-13 8z" fill="currentColor" /></svg>
                  </button>
                )}
              </div>

              <div className="path2-meta">
                {/* One length, printed. The professional chose it. */}
                <span className="path2-pill">{t(durationLabel(rx.duration))} · {rx.duration}m</span>
                <span className="path2-pill path2-pill--quiet">{t('{n}× this week', { n: rx.perWeek })}</span>
              </div>

              <div className="path2-bar" aria-hidden="true"><span style={{ width: `${pct}%` }} /></div>
              <span className="path2-count">{t('{done} of {total} done', { done: rx.done, total: rx.total })}</span>

              {!playable && (
                <span className="path2-off">{t('Not available to play yet — your therapist has been told.')}</span>
              )}
            </article>
          )
        })}
      </section>
    </>
  )
}
