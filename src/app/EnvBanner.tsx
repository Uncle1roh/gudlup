/* ============================================================================
   The strip that says where you are

   Across the top of every surface on every deployment that is not
   production. It exists for one failure: somebody demonstrating to a client,
   or testing a destructive change, on the real platform, because the screen
   looked the same as always.

   It is deliberately loud and deliberately not dismissible. A banner that
   can be closed is closed on the first day and absent on the day it would
   have mattered.

   It speaks the language of the surface under it, like the preview bar, and
   carries the database it is pointed at — which is the detail that actually
   settles the argument when two people disagree about which environment
   they are looking at.
   ============================================================================ */

import { useI18n } from '../i18n'
import { appEnv, databaseRef, envLabel, envNote, showsBanner } from './environment'

export function EnvBanner() {
  const { t } = useI18n()
  const env = appEnv()
  if (!showsBanner(env)) return null

  const ref = databaseRef()
  return (
    <div className={`envb envb--${env}`} role="region" aria-label={t('Environment')}>
      <span className="envb__tag">{t(envLabel(env))}</span>
      <span className="envb__note">{t(envNote(env))}</span>
      {ref && (
        <span className="envb__db" title={t('The database this deployment is pointed at')}>
          {ref}
        </span>
      )}
    </div>
  )
}
