/* ============================================================================
   "Teste de fones" — the waiting room's copy of the headphone check

   Same two buttons and the same rules as the one before a session
   (`lib/stereoCheck.ts`); only the frame differs, because here it is one
   pane in a waiting room rather than a whole screen.

   It is not decoration. A Good Loop treatment moves between the ears, so
   headphones that are mono, reversed or not really connected make the
   session do nothing — and the moment to find that out is before the
   professional joins, not during.

   The tone always plays from inside the tap: browsers start audio only in a
   user-gesture call stack, and a tone played from an effect comes out of a
   suspended context — silent, while the button turns green.
   ============================================================================ */

import { useCallback, useState } from 'react'
import { useI18n } from '../i18n'
import { playEarTone } from '../lib/audio'
import {
  startCheck, tonePlayed, markFailed, retryEar, checkPassed, anyFailed,
  type Ear, type StereoState,
} from '../lib/stereoCheck'

export function EarTest({ onPass }: { onPass?(): void }) {
  const { t } = useI18n()
  const [check, setCheck] = useState<StereoState>(() => startCheck())
  const [noAudio, setNoAudio] = useState(false)

  const play = useCallback((ear: Ear) => {
    const ok = playEarTone(ear)
    setNoAudio(!ok)
    setCheck((s) => {
      const next = ok ? tonePlayed(s, ear) : retryEar(s, ear)
      if (checkPassed(next)) onPass?.()
      return next
    })
  }, [onPass])

  const passed = checkPassed(check)

  return (
    <article className="glass call2-pane">
      <div className="call2-pane__top">
        <h2 className="call2-pane__h">{t('Headphone test')}</h2>
      </div>

      <p className="call2-note">{t('Put your headphones on and tap each side. You should hear a tone in that ear.')}</p>

      <div className="stereo2-row">
        {(['left', 'right'] as Ear[]).map((ear) => (
          <div key={ear} className="stereo2-side">
            <button
              type="button"
              className={`stereo2-btn is-${check[ear]}`}
              onClick={() => play(ear)}
              aria-pressed={check[ear] === 'ok'}
            >
              <span className="stereo2-btn__mark" aria-hidden="true">
                {check[ear] === 'ok' ? '✓' : check[ear] === 'failed' ? '✕' : '♪'}
              </span>
              <span className="stereo2-btn__label">{ear === 'left' ? t('Left') : t('Right')}</span>
            </button>
            {check[ear] !== 'failed'
              ? (
                <button type="button" className="stereo2-silent" onClick={() => setCheck((s) => markFailed(s, ear))}>
                  {t('I heard nothing on this side')}
                </button>
              )
              : <span className="stereo2-again">{t('Tap again to retry')}</span>}
          </div>
        ))}
      </div>

      {passed && <p className="call2-ok">{t('Perfect: stereo audio is working.')}</p>}

      {anyFailed(check) && (
        <p className="call2-warn">
          {t('Check that both sides are plugged in and worn the right way round, then tap that side again.')}
        </p>
      )}

      {noAudio && <p className="call2-warn">{t('This device cannot play a sound right now, so the check cannot run.')}</p>}
    </article>
  )
}
