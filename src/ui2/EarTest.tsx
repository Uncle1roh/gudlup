/* ============================================================================
   "Teste de fones" — the block the waiting room was missing

   From WSalaEspera.dc.html: play a sound, say which ear it came out of, get
   told whether that is right. It is not decoration. A Good Loop treatment
   moves between the ears, so headphones that are mono, reversed, or not
   really connected make the session do nothing — and the only moment to find
   that out is before the professional joins, not during.

   The side is chosen at random each time, so the answer cannot be learned.
   The tone always plays from inside the tap: browsers start audio only in a
   user-gesture call stack, and a tone played from an effect comes out of a
   suspended context — silent, while the screen asks what you heard.
   ============================================================================ */

import { useState } from 'react'
import { useI18n } from '../i18n'
import { playEarTone } from '../lib/audio'

type State =
  | { kind: 'idle' }
  | { kind: 'asking'; side: 'left' | 'right' }
  | { kind: 'right' }
  | { kind: 'wrong' }

export function EarTest({ onPass }: { onPass?(): void }) {
  const { t } = useI18n()
  const [state, setState] = useState<State>({ kind: 'idle' })

  function play() {
    const side: 'left' | 'right' = Math.random() < 0.5 ? 'left' : 'right'
    setState({ kind: 'asking', side })
    playEarTone(side)
  }

  function answer(said: 'left' | 'right') {
    if (state.kind !== 'asking') return
    if (said === state.side) { setState({ kind: 'right' }); onPass?.() }
    else setState({ kind: 'wrong' })
  }

  return (
    <article className="glass call2-pane">
      <div className="call2-pane__top">
        <h2 className="call2-pane__h">{t('Headphone test')}</h2>
        <button type="button" className="glass-btn call2-pill" onClick={play}>
          {state.kind === 'idle' ? t('Play a sound') : t('Play again')}
        </button>
      </div>

      {state.kind === 'idle' && (
        <p className="call2-note">{t('A session moves sound between your ears. One tap tells you whether yours are working.')}</p>
      )}

      {state.kind !== 'idle' && (
        <>
          <p className="call2-note">{t('Which ear did you hear the sound in?')}</p>
          <div className="call2-ears">
            <button type="button" className="call2-ear" onClick={() => answer('left')}>{t('Left')}</button>
            <button type="button" className="call2-ear" onClick={() => answer('right')}>{t('Right')}</button>
          </div>
        </>
      )}

      {state.kind === 'right' && <p className="call2-ok">{t('Perfect: stereo audio is working.')}</p>}
      {state.kind === 'wrong' && (
        <p className="call2-warn">
          {t('That was the other side. Your headphones may be reversed, or only one ear is connected — try again.')}
        </p>
      )}
    </article>
  )
}
