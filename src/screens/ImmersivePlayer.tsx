import { useEffect, useRef, useState } from 'react'
import { BreathingOrb } from '../components/BreathingOrb'
import { SessionPlayer } from '../lib/audio'
import { useI18n } from '../i18n'
import type { Protocol } from '../types/domain'

interface ImmersivePlayerProps {
  protocol: Protocol
  totalSeconds: number
  audioUrl?: string
  isPlaceholderNote?: boolean
  onComplete: () => void
}

function fmt(sec: number): string {
  const s = Math.max(0, Math.round(sec))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

function phaseIndexAt(elapsed: number, total: number, fractions: number[]): number {
  let acc = 0
  for (let i = 0; i < fractions.length; i++) {
    acc += fractions[i] * total
    if (elapsed < acc) return i
  }
  return fractions.length - 1
}

export function ImmersivePlayer({
  protocol,
  totalSeconds,
  audioUrl,
  isPlaceholderNote,
  onComplete,
}: ImmersivePlayerProps) {
  const { t } = useI18n()
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [hudVisible, setHudVisible] = useState(false)
  const [showHint, setShowHint] = useState(true)

  const playerRef = useRef<SessionPlayer | null>(null)
  const tickRef = useRef<number | null>(null)
  const lastTickRef = useRef<number>(0)
  const elapsedRef = useRef(0)
  const playingRef = useRef(false)
  const phaseRef = useRef(-1)
  const completedRef = useRef(false)
  const hudTimer = useRef<number | null>(null)

  const fractions = protocol.phases.map((p) => p.fraction)
  const phaseIdx = phaseIndexAt(elapsed, totalSeconds, fractions)
  const phase = protocol.phases[phaseIdx]
  const remaining = totalSeconds - elapsed

  // initial veil dim-to-dark over the first stretch of Phase 1
  const rampSeconds = Math.min(28, totalSeconds * 0.4)
  const baseVeil = Math.min(0.86, (elapsed / rampSeconds) * 0.86)

  function buzz() {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(28) } catch { /* unsupported */ }
    }
  }

  async function begin() {
    setStarted(true)
    const player = new SessionPlayer({ audioUrl, volume: 0.55 })
    playerRef.current = player
    await player.play()
    playingRef.current = true
    setPlaying(true)
    lastTickRef.current = Date.now()
    phaseRef.current = 0
    tickRef.current = window.setInterval(loop, 200)
    window.setTimeout(() => setShowHint(false), 5000)
  }

  function loop() {
    const now = Date.now()
    const dt = (now - lastTickRef.current) / 1000
    lastTickRef.current = now
    if (!playingRef.current) return

    elapsedRef.current += dt
    const e = elapsedRef.current

    const idx = phaseIndexAt(e, totalSeconds, fractions)
    if (idx !== phaseRef.current) {
      phaseRef.current = idx
      buzz()
    }

    if (e >= totalSeconds && !completedRef.current) {
      completedRef.current = true
      cleanup()
      onComplete()
      return
    }
    setElapsed(e)
  }

  function cleanup() {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
    playerRef.current?.stop()
    playerRef.current = null
    playingRef.current = false
  }

  function togglePlay() {
    if (!playerRef.current) return
    if (playingRef.current) {
      playerRef.current.pause()
      playingRef.current = false
      setPlaying(false)
    } else {
      void playerRef.current.resume()
      playingRef.current = true
      setPlaying(true)
      lastTickRef.current = Date.now()
    }
  }

  function revealHud() {
    setHudVisible(true)
    if (hudTimer.current) clearTimeout(hudTimer.current)
    hudTimer.current = window.setTimeout(() => setHudVisible(false), 3000)
  }

  function endSession() {
    if (completedRef.current) return
    completedRef.current = true
    cleanup()
    onComplete()
  }

  // auto-pause when the app/tab is backgrounded (UC-B2C-08)
  useEffect(() => {
    function onHidden() {
      if (document.hidden && playingRef.current) {
        playerRef.current?.pause()
        playingRef.current = false
        setPlaying(false)
        setHudVisible(true)
      }
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => document.removeEventListener('visibilitychange', onHidden)
  }, [])

  // cleanup on unmount
  useEffect(() => () => cleanup(), [])

  if (!started) {
    return (
      <div className="player">
        <div className="fade-in" style={{ display: 'grid', placeItems: 'center', gap: 34, padding: 26 }}>
          <BreathingOrb size={150} breathing={false} />
          <p className="lead" style={{ color: 'rgba(255,255,255,0.72)', maxWidth: 280 }}>
            {t("Find a comfortable position. Close your eyes when you're ready.")}
          </p>
          <button className="btn btn--light" style={{ maxWidth: 220 }} onClick={begin}>
            ▶ {t('Begin')}
          </button>
          {isPlaceholderNote && (
            <p className="small" style={{ color: 'rgba(255,255,255,0.4)', maxWidth: 280 }}>
              {t('Placeholder ambient audio — real guided voice is produced separately.')}
            </p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="player" onClick={revealHud}>
      {/* orb only in Phase 2; otherwise a faint ambient pulse */}
      {phase.showOrb ? (
        <div className="fade-in">
          <BreathingOrb size={230} />
        </div>
      ) : (
        <div className="ambient-pulse" />
      )}

      {/* dim-to-dark veil for the intro */}
      <div className="player__veil" style={{ opacity: baseVeil }} />

      <div className="player__hint" style={{ opacity: showHint ? 1 : 0 }}>
        {t('Let the sound carry you.')}
      </div>

      {/* tap-to-reveal HUD */}
      <div className="hud" style={{ opacity: hudVisible || !playing ? 1 : 0, pointerEvents: hudVisible || !playing ? 'auto' : 'none' }}>
        <div className="hud__top">
          <span className="hud__phase">{t(phase.name)}</span>
          <span className="hud__time">{fmt(remaining)}</span>
        </div>
        <div className="hud__controls">
          <button className="hud__btn hud__btn--end" onClick={(e) => { e.stopPropagation(); endSession() }} aria-label={t('End session')}>
            ✕
          </button>
          <button className="hud__btn" onClick={(e) => { e.stopPropagation(); togglePlay() }} aria-label={playing ? t('Pause') : t('Resume')}>
            {playing ? '❚❚' : '▶'}
          </button>
          <div style={{ width: 50 }} />
        </div>
      </div>
    </div>
  )
}
