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

/** Play a 440 Hz tone in a single ear to verify stereo routing (UC-B2C-07). */
export function playEarTone(side: 'left' | 'right', durationMs = 1100): void {
  const ctx = newCtx()
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
  osc.onended = () => void ctx.close()
}

/* -------------------------------------------------------------------------- */

export interface SessionPlayerOptions {
  /** Pre-rendered audio URL (MVP). If omitted, a placeholder bed is synthesized. */
  audioUrl?: string
  volume?: number // 0..1
}

/**
 * Plays the audio bed for a session. Phase progression is driven by a timer in
 * the player UI (not by audio currentTime), so the placeholder can loop freely
 * while real files run to their exact length.
 */
export class SessionPlayer {
  readonly isPlaceholder: boolean
  private volume: number
  private audioUrl?: string

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
  }

  async play(): Promise<void> {
    if (this.isPlaceholder) return this.playSynth()
    return this.playFile()
  }

  pause(): void {
    if (this.el) this.el.pause()
    if (this.ctx && this.master) this.fadeMaster(0, 0.3)
  }

  async resume(): Promise<void> {
    if (this.el) await this.el.play()
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
      this.el = new Audio(this.audioUrl)
      this.el.preload = 'auto'
      this.el.volume = this.volume
    }
    await this.el.play()
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
