/* ============================================================================
   The six phases, on the waterfall — and lit by the one you are hearing

   WHAT THIS REPLACED. The methodology page opened on `.pub-frame`: the
   waterfall, with eight pills scattered over it reading "Voce guida",
   "Battimenti binaurali", "Frase àncora" — the eight TOOLS, labelled as
   layers under a headline that called them layers too. The analysts read
   that page in Italian on 2026-11-22 and had the same objection twice: the
   frame shows the wrong thing, and the word over it is the wrong word. A
   session is SIX PHASES, the page's own long body says so two sections
   further down (`methodCopy.ts`, "Sei fasi. Un unico arco narrativo"), and
   the picture at the top was arguing with it.

   So the frame now carries the six, in order, falling left to right the way
   the water does — and when a clip plays, the phase it belongs to lights up.
   That last part is the whole request: not a player beside a diagram, a
   diagram that is the player.

   NO CLIPS, NO BUTTON. `PHASE_CLIPS` is empty until Giampiero's six cuts are
   in the repository (`config/publicSite.ts` says how to turn it on), and
   with an empty list this draws exactly what it drew before — a still frame,
   `role="img"`, no affordance that promises sound. That rule is older than
   this file: v19 dropped a "hear the layers" button for it, and a button
   that plays nothing is the worst thing a page like this could carry. The
   difference is that the still version is now also CORRECT.

   SHORT NAMES, NOT THE CLINICAL ONES. The pills read `ph1h..ph6h` from
   `copy.ts` — "Accoglienza", "Respiro", "Esplorazione" — the public-facing
   names the Come funziona page already uses, in three languages. The long
   body's own names ("Introduzione + Convalida", "Respiro + Scansione
   Corporea") are the clinical ones and are three times too long to sit on a
   photograph.
   ============================================================================ */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PHASE_CLIPS } from '../config/publicSite'
import type { CopyKey } from './copy'
import { useSite } from './lang'

/** The six phases: the pill's words, the line under the frame, and where on
    the picture the pill sits.

    THE SHAPE IS AN ARC AND THE ARC IS THE ARGUMENT. The long body on this
    same page names it — "un unico arco narrativo: partenza, esplorazione,
    ritorno" — so the six descend from 01, reach their lowest point at 04,
    which is the phase that page calls the heart of the session, and climb
    back for the return. Six pills strung along a straight diagonal would
    have read as a toolbar tilted for decoration; this reads as a journey
    down and back, which is what it is. */
const PHASES: { h: CopyKey; t: CopyKey; left: number; top: number }[] = [
  { h: 'ph1h', t: 'ph1t', left: 9, top: 16 },
  { h: 'ph2h', t: 'ph2t', left: 22, top: 32 },
  { h: 'ph3h', t: 'ph3t', left: 36, top: 48 },
  { h: 'ph4h', t: 'ph4t', left: 52, top: 60 },
  { h: 'ph5h', t: 'ph5t', left: 69, top: 42 },
  { h: 'ph6h', t: 'ph6t', left: 85, top: 24 },
]

/** Six and only six. A list of four would light four phases and leave two
    dark for a reason the page never explains, which reads as a fault rather
    than as a gap — so a short list is no list at all. */
function clips(): readonly string[] {
  return PHASE_CLIPS.length >= PHASES.length ? PHASE_CLIPS.slice(0, PHASES.length) : []
}

export function MethodPhases() {
  const { s } = useSite()
  const audio = useRef<HTMLAudioElement | null>(null)
  const live = useMemo(() => clips(), [])

  /** Which phase is sounding (−1 = none), and how far into its clip. The
      fraction drives the rail; it is the only thing `timeupdate` is for. */
  const [at, setAt] = useState(-1)
  const [frac, setFrac] = useState(0)
  const [playing, setPlaying] = useState(false)

  /* One element, made once, and silenced on the way out. A visitor who
     leaves this page mid-clip must not keep hearing it from the next one. */
  useEffect(() => {
    if (!live.length) return
    const el = new Audio()
    el.preload = 'none'
    audio.current = el
    return () => {
      el.pause()
      el.removeAttribute('src')
      el.load()
      audio.current = null
    }
  }, [live.length])

  const play = useCallback((i: number) => {
    const el = audio.current
    if (!el || !live[i]) return
    if (el.getAttribute('src') !== live[i]) {
      el.setAttribute('src', live[i])
      el.load()
    }
    setAt(i)
    setFrac(0)
    /* A REFUSED play() MUST PUT THE PAGE BACK. The person pressed a button,
       so a refusal is rare — but a browser that blocks it (or a device with
       no output at all, which is every headless check of this page) would
       otherwise leave a phase lit, a Stop offered and a caption describing
       audio that is not sounding. The page would be lying about the one
       thing it exists to show. */
    void el.play().then(() => setPlaying(true)).catch(() => {
      setPlaying(false)
      setAt(-1)
      setFrac(0)
    })
  }, [live])

  const toggle = useCallback(() => {
    const el = audio.current
    if (!el) return
    if (playing) { el.pause(); setPlaying(false); return }
    if (at < 0) { play(0); return }
    void el.play().then(() => setPlaying(true)).catch(() => { setPlaying(false); setAt(-1); setFrac(0) })
  }, [at, play, playing])

  const stop = useCallback(() => {
    const el = audio.current
    if (el) { el.pause(); el.currentTime = 0 }
    setPlaying(false)
    setAt(-1)
    setFrac(0)
  }, [])

  /* The six are one session, so the end of a clip is the start of the next
     one — and the end of the sixth is the end of the session. */
  useEffect(() => {
    const el = audio.current
    if (!el) return
    const onTime = () => {
      const d = el.duration
      setFrac(Number.isFinite(d) && d > 0 ? Math.min(1, el.currentTime / d) : 0)
    }
    const onEnd = () => {
      setFrac(1)
      const next = at + 1
      if (next < live.length) play(next)
      else { setPlaying(false); setAt(-1); setFrac(0) }
    }
    const onPause = () => setPlaying(false)
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('ended', onEnd)
    el.addEventListener('pause', onPause)
    return () => {
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('ended', onEnd)
      el.removeEventListener('pause', onPause)
    }
  }, [at, live, play])

  const sounding = live.length > 0

  /* With no clips this is the picture it always was: one label for the whole
     frame and nothing inside it to press. With clips it is a group of
     buttons, and `role="img"` would hide every one of them. */
  const frame = sounding
    ? { role: 'group' as const, 'aria-label': s('t_player') }
    : { role: 'img' as const, 'aria-label': s('t_frame') }

  return (
    <div className="pub-ph-wrap">
      <div className={sounding ? 'pub-frame pub-frame--live' : 'pub-frame'} {...frame}>
        <div className="pub-frame__veil" aria-hidden="true" />

        {PHASES.map((p, i) => {
          const on = i === at
          const cls = `pub-ph${on ? ' pub-ph--on' : ''}${sounding ? ' pub-ph--live' : ''}`
          const style = { left: `${p.left}%`, top: `${p.top}%` }
          const num = String(i + 1).padStart(2, '0')
          /* A still frame's phases are not buttons. Only the sounding one
             gets a <button>, which is also what keeps the keyboard order
             honest: six stops when there are six things to press, none when
             there is nothing. */
          return sounding ? (
            <button
              type="button"
              key={p.h}
              className={cls}
              style={style}
              aria-pressed={on}
              onClick={() => (on && playing ? toggle() : play(i))}
            >
              <span className="pub-ph__no">{num}</span>
              <span className="pub-ph__h">{s(p.h)}</span>
            </button>
          ) : (
            <span key={p.h} className={cls} style={style}>
              <span className="pub-ph__no">{num}</span>
              <span className="pub-ph__h">{s(p.h)}</span>
            </span>
          )
        })}

        {/* The rail is the "lights up" of the request made literal: six
            segments, the ones behind you full, the one you are in filling. */}
        {sounding && (
          <div className="pub-ph-rail" aria-hidden="true">
            {PHASES.map((p, i) => (
              <span key={p.h} className="pub-ph-rail__seg">
                <span
                  className="pub-ph-rail__fill"
                  style={{ transform: `scaleX(${i < at ? 1 : i === at ? frac : 0})` }}
                />
              </span>
            ))}
          </div>
        )}
      </div>

      {sounding && (
        <div className="pub-ph-bar">
          <button type="button" className="pub-ph-btn" onClick={toggle}>
            <svg viewBox="0 0 24 24" aria-hidden="true" width="18" height="18">
              {playing
                ? <><rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor" /><rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" /></>
                : <path d="M8 5.5v13l11-6.5z" fill="currentColor" />}
            </svg>
            {playing ? s('t_pause') : s('t_play')}
          </button>
          {at >= 0 && (
            <button type="button" className="pub-ph-quiet" onClick={stop}>{s('t_stop')}</button>
          )}
          {/* What you are hearing, in words, under the picture: the pill on
              the frame has room for a name and nothing else. */}
          <p className="pub-ph-say">{at >= 0 ? s(PHASES[at].t) : s('t_hint')}</p>
        </div>
      )}
    </div>
  )
}
