/* ============================================================================
   Good Loop — two voices at once

   A pure rule, in its own file, because it is the kind of thing that has to be
   read and argued about on its own: no React, no audio, no state. Tracks and
   clips arrive as the shapes it actually needs — the Studio's own `Track` and
   `Clip` satisfy them structurally, and this module never has to know what
   else they carry.
   ============================================================================ */

/** What the rule needs of a clip. */
export interface OverlapClip {
  id: string
  startSec: number
  durationSec: number
  /** Cast per type inside — a voice has a `pan`, a sample has its draw intent. */
  params: object
}

/** What the rule needs of a track. */
export interface OverlapTrack {
  type: string
  channel?: 'L' | 'C' | 'R'
  clips: OverlapClip[]
}

/** The one phase this rule cares about. */
export interface OverlapPhase {
  fase: number
  startSec: number
  endSec: number
}

/* ---- two voices at once --------------------------------------------------

   Sliding the later line down the timeline is the wrong answer almost
   everywhere: a protocol's voices are placed against music, against a phase
   map and against each other, and moving one moves it out of the bed it was
   written for. The POs' answer is two rules.

     · ANYWHERE BUT THE CLOSING, both voices CENTRED — they move apart in the
       stereo field instead of in time. The earlier line goes right, the later
       one goes left, and the timeline does not change. Two voices 180° apart
       are two voices you can follow; two in the middle are mud.

     · EITHER VOICE ALREADY LEFT OR RIGHT — nothing. A dichotic lane is placed
       where it is on purpose, and that overlap is the composition.

     · IN THE SIXTH PHASE — the closing is centred and stays centred: panning a
       voice away from the middle at the end of a session undoes what the phase
       is for. These move in TIME instead, one second apart, and the phase runs
       longer. The session may end a little past 6 / 12 / 24 minutes; accepted.

   The closing's MUSIC is then stretched to the last voice so the two fade out
   together — a voice still speaking over a bed that has already gone is the
   failure this rule would otherwise create. Only the music: a soundscape is a
   texture that was placed to end where it ends. */

/**
 * Music, as opposed to a texture.
 *
 * The PLAIN import puts both on `sample` lanes — what tells them apart is
 * which pool the clip draws from and whether it loops, not the lane's type. A
 * soundscape is a bed that repeats; a music clip is a piece that plays once,
 * and only the second is stretched to cover a closing that ran long.
 */
function isMusicClip(t: OverlapTrack, c: OverlapClip): boolean {
  if (t.type === 'music') return true
  if (t.type !== 'sample') return false
  const p = c.params as { drawPhase?: number; loop?: boolean }
  return p.drawPhase !== undefined || p.loop === false
}

/** The second of air between two lines that must stay centred. The POs' number. */
export const VOICE_GAP = 1

export interface VoicePlan {
  /** clip id → new start, for the closing's time separations */
  starts: Record<string, number>
  /** clip id → new pan, for the stereo separations */
  pans: Record<string, number>
  /** clip id → new duration, for the closing's music */
  stretched: Record<string, number>
  /** where the closing's last voice now ends (0 when nothing moved) */
  closingEnd: number
  panned: number
  moved: number
  longer: number
}

/** Pure: same tracks in, same plan out. It runs inside a state updater, and
    React invokes those twice under StrictMode. */
export function planVoiceOverlaps(tracks: OverlapTrack[], closing: OverlapPhase | null): VoicePlan {
  const EPS = 1e-3
  const plan: VoicePlan = { starts: {}, pans: {}, stretched: {}, closingEnd: 0, panned: 0, moved: 0, longer: 0 }

  interface VoiceRef { clipId: string; start: number; dur: number; centre: boolean }
  const voices: VoiceRef[] = []
  for (const t of tracks) {
    if (t.type !== 'voice') continue
    for (const c of t.clips) {
      const vp = c.params as { pan?: number }
      voices.push({
        clipId: c.id,
        start: c.startSec,
        dur: c.durationSec,
        /* "Centred" is the two things together: a lane that was not sent hard
           left or right, and a clip that was not panned inside it. */
        centre: (t.channel ?? 'C') === 'C' && Math.abs(vp.pan ?? 0) < 0.2,
      })
    }
  }
  if (voices.length < 2) return plan

  const startOf = (v: VoiceRef) => plan.starts[v.clipId] ?? v.start
  const endOf = (v: VoiceRef) => startOf(v) + v.dur

  /* Time order, re-read after every move: pushing a line in the closing can
     put it on top of the one that used to follow it, and that pair has to be
     seen too. Every move is strictly later, so this terminates. */
  for (let guard = 0; guard < voices.length * 4; guard++) {
    const order = [...voices].sort((a, b) => startOf(a) - startOf(b))
    let acted = false
    for (let i = 0; i < order.length - 1 && !acted; i++) {
      const a = order[i]
      for (let j = i + 1; j < order.length; j++) {
        const b = order[j]
        if (startOf(b) >= endOf(a) - EPS) break  // sorted: nothing later overlaps a either
        const overlapAt = startOf(b)
        const inClosing = !!closing && overlapAt >= closing.startSec - EPS
        if (inClosing) {
          plan.starts[b.clipId] = endOf(a) + VOICE_GAP
          acted = true
          break
        }
        if (a.centre && b.centre && plan.pans[a.clipId] === undefined && plan.pans[b.clipId] === undefined) {
          plan.pans[a.clipId] = 1    // the first one right
          plan.pans[b.clipId] = -1   // the second one left
          plan.panned++
          acted = true
          break
        }
        /* Already apart in the field, or already answered: leave it. */
      }
    }
    if (!acted) break
  }

  /* Lines moved, not moves made: a third voice can be pushed twice — once off
     the line before it, then again off the line that just landed in front of
     it — and the operator is being told how much of their timeline changed. */
  plan.moved = Object.keys(plan.starts).length

  if (!closing || !plan.moved) return plan

  /* The closing now ends where its last voice ends. */
  for (const v of voices) {
    if (endOf(v) > closing.startSec) plan.closingEnd = Math.max(plan.closingEnd, endOf(v))
  }

  /* …and its music has to reach that far. The fades are relative to a clip's
     end, so stretching the bed is what keeps voice and music going quiet
     together. Only a clip that CLOSES the phase is stretched — one that ends
     in the middle of it was meant to. */
  for (const t of tracks) {
    for (const c of t.clips) {
      if (!isMusicClip(t, c)) continue
      const end = c.startSec + c.durationSec
      const closesThePhase = end > closing.startSec && end >= closing.endSec - 2
      if (closesThePhase && plan.closingEnd > end + EPS) {
        plan.stretched[c.id] = plan.closingEnd - c.startSec
        plan.longer++
      }
    }
  }
  return plan
}
