/* ============================================================================
   "Teste de fones" — the block the waiting room was missing

   From WSalaEspera.dc.html: play a sound, say which ear it came out of, get
   told whether that is right. It is not decoration. A Good Loop treatment
   moves between the ears, so headphones that are mono, reversed, or not
   really connected make the session do nothing — and the only moment to find
   that out is before the professional joins, not during.

   It asked about ONE ear and called that a pass, which tests half a pair of
   headphones: a left channel that works and a right one that does not came
   through clean half the time. It now runs the same two-ear check the
   session runs (`lib/stereoCheck.ts`) — random order, both ears, one
   unbroken run — so the two places that ask this question ask the same
   question. The presentation stays the waiting room's: one pane, not a
   full screen.

   The tone always plays from inside the tap: browsers start audio only in a
   user-gesture call stack, and a tone played from an effect comes out of a
   suspended context — silent, while the screen asks what you heard.
   ============================================================================ */

import { useState } from 'react'
import { useI18n } from '../i18n'
import { playEarTone } from '../lib/audio'
import {
  startCheck, retryCheck, tonePlayed, answerEar, currentEar, checkPassed, toneNumber,
  type Ear, type StereoState,
} from '../lib/stereoCheck'

export function EarTest({ onPass }: { onPass?(): void }) {
  const { t } = useI18n()
  const [check, setCheck] = useState<StereoState>(() => startCheck())
  const [noAudio, setNoAudio] = useState(false)

  function play() {
    setCheck((s) => {
      const ear = currentEar(s)
      if (!ear) return s
      const ok = playEarTone(ear)
      setNoAudio(!ok)
      return ok ? tonePlayed(s) : s
    })
  }

  function answer(said: Ear) {
    setCheck((s) => {
      const next = answerEar(s, said)
      if (checkPassed(next)) onPass?.()
      return next
    })
  }

  return (
    <article className="glass call2-pane">
      <div className="call2-pane__top">
        <h2 className="call2-pane__h">{t('Headphone test')}</h2>
        {check.phase !== 'passed' && (
          <button type="button" className="glass-btn call2-pill" onClick={play} disabled={check.phase === 'asking'}>
            {check.phase === 'intro' ? t('Play the tone') : t('Play the second tone')}
          </button>
        )}
      </div>

      {check.phase === 'intro' && (
        <p className="call2-note">{t('Put your headphones on. We will play a short tone in one ear, then in the other — and you tell us which.')}</p>
      )}

      {check.phase === 'asking' && (
        <>
          <p className="call2-note">{t('Tone {n} of 2', { n: toneNumber(check) })} · {t('Which ear hears the tone?')}</p>
          <div className="call2-ears">
            <button type="button" className="call2-ear" onClick={() => answer('left')}>{t('Left')}</button>
            <button type="button" className="call2-ear" onClick={() => answer('right')}>{t('Right')}</button>
          </div>
        </>
      )}

      {check.phase === 'between' && <p className="call2-ok">{t('Correct. One more.')}</p>}
      {check.phase === 'passed' && <p className="call2-ok">{t('Perfect: stereo audio is working.')}</p>}

      {check.phase === 'failed' && (
        <>
          <p className="call2-warn">
            {t('That was the other ear. Check that both sides are plugged in and worn the right way round, then try again.')}
          </p>
          <button type="button" className="glass-btn call2-pill" onClick={() => setCheck((s) => retryCheck(s))}>
            {t('Try again')}
          </button>
        </>
      )}

      {noAudio && <p className="call2-warn">{t('This device cannot play a sound right now, so the check cannot run.')}</p>}
    </article>
  )
}
