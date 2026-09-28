/* ============================================================================
   The bar an admin carries through the other apps

   Rendered above every surface while preview is on, and nowhere else. It does
   three things: says plainly that the data is not real, moves between the
   surfaces without going back to the console first, and gets out.

   It says "demo data" in every state. Sales will have this on screen in front
   of a customer, and a demo that quietly looks like production is how
   somebody ends up believing a number on it.

   It speaks the language of the surface under it (t()), since it sits on top
   of that surface — the console itself stays Italian.

   On a phone the note goes, the surface buttons scroll sideways and the exit
   stays pinned at the right edge: it is the one control that must always be
   reachable.
   ============================================================================ */

import { useI18n } from '../i18n'
import { SURFACES, currentSurface, go, endPreview, type PreviewSurface } from './preview'

/** English source keys for the bar's surface buttons (see i18n/studio.ts). */
const SURFACE_KEY: Record<PreviewSurface, string> = { admin: 'Admin', app: 'App', therapist: 'Therapist', company: 'Company' }

export function PreviewBar() {
  const { t } = useI18n()
  const here: PreviewSurface = currentSurface()
  return (
    <div className="pvw" role="region" aria-label={t('Admin preview')}>
      <span className="pvw__tag">{t('Preview')}</span>
      <span className="pvw__note">{t('demo data — nothing real is read or written')}</span>
      <nav className="pvw__nav">
        {SURFACES.map((s) => (
          <button
            key={s.id}
            className={`pvw__btn${here === s.id ? ' is-on' : ''}`}
            aria-current={here === s.id ? 'page' : undefined}
            onClick={() => (s.id === 'admin' ? endPreview() : go(s.id))}
          >
            {t(SURFACE_KEY[s.id])}
          </button>
        ))}
      </nav>
      <button className="pvw__exit" onClick={endPreview}>{t('Exit preview')}</button>
    </div>
  )
}
