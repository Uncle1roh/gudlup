/* ============================================================================
   Good Loop — Audio (MVP)
   Two responsibilities for now:
   1) Stereo check: play a pure tone in ONE ear only (needs real channel routing).
   2) SessionPlayer: play a pre-rendered session file (the MVP model). When no
      file exists yet, synthesize a calm placeholder bed so the flow is audible.

   The full real-time compositing engine (9 patterns / 8 layers) is a later
   module; this file is intentionally small.
   ============================================================================ */

type Ctx = AudioContext

function newCtx(): Ctx {
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
  return new AC()
}

/**
 * Play a 440 Hz tone in a single ear to verify stereo routing (UC-B2C-07).
 *
 * Two things here are load-bearing and were not.
 *
 * RESUME. A context created outside a user-gesture call stack comes up
 * `suspended` on Safari, iOS and some Android WebViews, and stays there: the
 * oscillator is scheduled but the clock never advances, so the tone is SILENT.
 * The person is asked which ear hears a tone that never sounded, answers
 * wrong, and is told their headphones are broken. Every other context in this
 * codebase resumes; this one did not.
 *
 * CLOSE ON A TIMER, not on `onended`. A suspended context never fires
 * `onended`, so the close never ran and every attempt leaked a live context.
 * iOS allows about four, after which even the gesture-driven "play again"
 * button goes quiet and the check is unusable for the rest of the session.
 */
export function playEarTone(side: 'left' | 'right', durationMs = 1100): void {
  const ctx = newCtx()
  if (ctx.state === 'suspended') void ctx.resume()
  const osc = ctx.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = 440

  const gain = ctx.createGain()
  const merger = ctx.createChannelMerger(2)
  const channel = side === 'left' ? 0 : 1

  osc.connect(gain)
  gain.connect(merger, 0, channel) // route to one channel only → one ear
  merger.connect(ctx.destination)

  const t = ctx.currentTime
  const end = t + durationMs / 1000
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(0.16, t + 0.04) // soft attack, no click
  gain.gain.setValueAtTime(0.16, end - 0.12)
  gain.gain.linearRampToValueAtTime(0, end)

  osc.start(t)
  osc.stop(end + 0.05)
  /* Belt and braces: close when the note ends, and again on a wall clock in
     case the context was never allowed to run and `onended` never comes. */
  let closed = false
  const close = () => { if (!closed) { closed = true; void ctx.close() } }
  osc.onended = close
  setTimeout(close, durationMs + 400)
}

/* -------------------------------------------------------------------------- */

export interface SessionPlayerOptions {
  /** Pre-rendered audio URL (MVP). If omitted, a placeholder bed is synthesized. */
  audioUrl?: string
  volume?: number // 0..1
  /**
   * Called when a real file was requested but could not be played, and the
   * synthesized bed took over. A 404, a CORS refusal or an expired signed
   * URL used to leave the session in SILENCE — the timer ran, the phases
   * advanced, and the person listened to nothing for twelve minutes. The
   * bed is a poor substitute for a rendered voice, but it is audibly a
   * session; silence is a broken product nobody reports.
   */
  onFallback?: (reason: string) => void
}

/**
 * Plays the audio bed for a session. Phase progression is driven by a timer in
 * the player UI (not by audio currentTime), so the placeholder can loop freely
 * while real files run to their exact length.
 */
export class SessionPlayer {
  /** True when NO file was supplied — the caller knew it was a placeholder. */
  readonly isPlaceholder: boolean
  /** True once a requested file failed and the bed took over. */
  get fellBack(): boolean { return this.didFallBack }
  private didFallBack = false
  private volume: number
  private audioUrl?: string
  private onFallback?: (reason: string) => void

  // file mode
  private el?: HTMLAudioElement
  // synth mode
  private ctx?: Ctx
  private master?: GainNode
  private oscillators: OscillatorNode[] = []
  private lfo?: OscillatorNode

  constructor(opts: SessionPlayerOptions = {}) {
    this.audioUrl = opts.audioUrl
    this.isPlaceholder = !opts.audioUrl
    this.volume = opts.volume ?? 0.5
    this.onFallback = opts.onFallback
  }

  async play(): Promise<void> {
    if (this.isPlaceholder) return this.playSynth()
    try {
      await this.playFile()
    } catch (e) {
      // The file is unreachable or the browser refused it. Fall back to the
      // bed rather than running a silent session.
      this.el = undefined
      this.didFallBack = true
      this.onFallback?.(describeAudioError(e))
      await this.playSynth()
    }
  }

  pause(): void {
    if (this.el) this.el.pause()
    if (this.ctx && this.master) this.fadeMaster(0, 0.3)
  }

  async resume(): Promise<void> {
    if (this.el) {
      // A resume can fail the same way a start can (the tab lost the media
      // session, the URL expired mid-session). Same answer: keep sound.
      try {
        await this.el.play()
      } catch (e) {
        this.el = undefined
        this.didFallBack = true
        this.onFallback?.(describeAudioError(e))
        await this.playSynth()
        return
      }
    }
    if (this.ctx && this.master) {
      if (this.ctx.state === 'suspended') await this.ctx.resume()
      this.fadeMaster(this.bedLevel(), 0.4)
    }
  }

  stop(): void {
    if (this.el) {
      this.el.pause()
      this.el.currentTime = 0
      this.el = undefined
    }
    if (this.ctx) {
      try {
        this.oscillators.forEach((o) => o.stop())
        this.lfo?.stop()
      } catch {
        /* already stopped */
      }
      void this.ctx.close()
      this.ctx = undefined
      this.master = undefined
      this.oscillators = []
      this.lfo = undefined
    }
  }

  setVolume(v: number): void {
    this.volume = Math.min(1, Math.max(0, v))
    if (this.el) this.el.volume = this.volume
    if (this.master) this.master.gain.value = this.bedLevel()
  }

  // --- file mode -----------------------------------------------------------
  private async playFile(): Promise<void> {
    if (!this.el) {
      const el = new Audio()
      // crossOrigin matters for a bucket on another origin: without it the
      // element loads but the audio graph cannot touch it, and some browsers
      // refuse outright.
      el.crossOrigin = 'anonymous'
      el.preload = 'auto'
      el.volume = this.volume
      el.src = this.audioUrl as string
      this.el = el
    }
    const el = this.el
    // `play()` resolves as soon as playback STARTS, which for a src that
    // 404s never happens — it rejects on some browsers and hangs on others.
    // Racing it against the element's own error event covers both.
    await new Promise<void>((resolve, reject) => {
      let settled = false
      const done = (fn: () => void) => { if (!settled) { settled = true; cleanup(); fn() } }
      const onError = () => done(() => reject(new Error(mediaErrorText(el))))
      const cleanup = () => { el.removeEventListener('error', onError) }
      el.addEventListener('error', onError)
      el.play().then(() => done(resolve), (e) => done(() => reject(e)))
    })
  }

  // --- synth placeholder ---------------------------------------------------
  // A soft, slow pad: a few low partials through a lowpass, gently breathing.
  private bedLevel(): number {
    return 0.12 * this.volume
  }

  private fadeMaster(to: number, seconds: number): void {
    if (!this.ctx || !this.master) return
    const now = this.ctx.currentTime
    this.master.gain.cancelScheduledValues(now)
    this.master.gain.setValueAtTime(this.master.gain.value, now)
    this.master.gain.linearRampToValueAtTime(to, now + seconds)
  }

  private async playSynth(): Promise<void> {
    if (this.ctx) {
      await this.resume()
      return
    }
    const ctx = newCtx()
    this.ctx = ctx
    if (ctx.state === 'suspended') await ctx.resume()

    const master = ctx.createGain()
    master.gain.value = 0
    this.master = master

    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 760
    lp.Q.value = 0.6

    // calm partials (G major-ish, low and quiet)
    const partials = [
      { f: 196, g: 0.5 }, // G3
      { f: 293.66, g: 0.32 }, // D4
      { f: 392, g: 0.18 }, // G4
    ]
    partials.forEach(({ f, g }, i) => {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = f
      o.detune.value = (i - 1) * 4 // slight spread for warmth
      const og = ctx.createGain()
      og.gain.value = g
      o.connect(og).connect(lp)
      o.start()
      this.oscillators.push(o)
    })
    lp.connect(master).connect(ctx.destination)

    // slow amplitude breathing on the master
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.08 // ~12s cycle
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 0.03 * this.volume
    lfo.connect(lfoGain).connect(master.gain)
    lfo.start()
    this.lfo = lfo

    this.fadeMaster(this.bedLevel(), 2.5) // gentle fade-in
  }
}

/* -------------------------------------------------------------------------- */

/** What an <audio> element's MediaError actually means, in words. */
function mediaErrorText(el: HTMLAudioElement): string {
  switch (el.error?.code) {
    case MediaError.MEDIA_ERR_ABORTED: return 'loading was aborted'
    case MediaError.MEDIA_ERR_NETWORK: return 'the network dropped'
    case MediaError.MEDIA_ERR_DECODE: return 'the file could not be decoded'
    case MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: return 'the file is missing or unreadable'
    default: return 'the file could not be played'
  }
}

/** A short, non-technical reason for a playback failure. */
export function describeAudioError(e: unknown): string {
  const name = (e as { name?: string } | undefined)?.name
  // A browser that blocks autoplay is a DIFFERENT problem from a missing
  // file, and the person can fix one of them by tapping.
  if (name === 'NotAllowedError') return 'playback needs a tap to start'
  const message = (e as { message?: string } | undefined)?.message
  return message && message.length < 120 ? message : 'the file could not be played'
}
