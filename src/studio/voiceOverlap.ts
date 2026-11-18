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

   The closing's MUSIC is then stretched PAST the last voice — see the tail
   below. Only the music: a soundscape is a texture that was placed to end
   where it ends. */

/* ---- the tail -----------------------------------------------------------

   The first version of this rule stretched the closing's music to the last
   voice so the two went quiet TOGETHER. That is what made protocols stop
   dead: the last word and the last bar land on the same instant, and a
   session that has spent twenty minutes letting someone down slowly ends
   like a door closing.

   The POs' rule (2026-11-18): a voice clip must never end the piece with the
   music. The last voice finishes, and the music is still there — long enough
   to be heard as an ending rather than a cut. So the bed is stretched to the
   last voice PLUS a tail, and that is true whether or not any voice was
   moved: ending abruptly is not a side effect of resolving an overlap, it is
   the ordinary case, and this is the ordinary fix.

   The number is a floor and a target, not one number, because stretching a
   bed that is already long enough would be re-authoring something that was
   composed. A bed that already outlasts the last voice by MIN is left alone;
   one that does not is stretched to exactly TARGET. */

/** The least air allowed between the last voice and the end of the music. */
export const MUSIC_TAIL_MIN_SEC = 5
/** What a bed is stretched TO when it has less than that. Inside the POs'
    5–10 s, and far enough from the floor that a half-second of TTS drift does
    not put the clip back under it. */
export const MUSIC_TAIL_SEC = 8

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
  /** where the closing's last voice now ends (0 when there is no closing) */
  closingEnd: number
  /** where the session has to reach: the furthest end of anything, after the
      moves and the tail (0 when nothing changed) */
  sessionEnd: number
  panned: number
  moved: number
  longer: number
}

/** Pure: same tracks in, same plan out. It runs inside a state updater, and
    React invokes those twice under StrictMode. */
export function planVoiceOverlaps(tracks: OverlapTrack[], closing: OverlapPhase | null): VoicePlan {
  const EPS = 1e-3
  const plan: VoicePlan = { starts: {}, pans: {}, stretched: {}, closingEnd: 0, sessionEnd: 0, panned: 0, moved: 0, longer: 0 }

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
  const startOf = (v: VoiceRef) => plan.starts[v.clipId] ?? v.start
  const endOf = (v: VoiceRef) => startOf(v) + v.dur

  /* Time order, re-read after every move: pushing a line in the closing can
     put it on top of the one that used to follow it, and that pair has to be
     seen too. Every move is strictly later, so this terminates. */
  for (let guard = 0; voices.length > 1 && guard < voices.length * 4; guard++) {
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

  if (!closing) return plan

  /* Where the closing's last voice ends — after any move above, and whether
     or not there was one. This is the instant the tail is measured from. */
  for (const v of voices) {
    if (endOf(v) > closing.startSec) plan.closingEnd = Math.max(plan.closingEnd, endOf(v))
  }
  if (!plan.closingEnd) return plan   // no voice in the closing: nothing to outlast

  /* …and the music has to outlast it. Only a clip that CLOSES the phase is
     stretched — one that ends in the middle of it was meant to. The clip's
     own fade-out is relative to its end and travels with the stretch, which
     is why moving the end is the whole fix: the bed fades where it now ends,
     after the voice has finished, instead of on top of the last word. */
  const wantEnd = plan.closingEnd + MUSIC_TAIL_SEC
  const leastEnd = plan.closingEnd + MUSIC_TAIL_MIN_SEC
  for (const t of tracks) {
    for (const c of t.clips) {
      if (!isMusicClip(t, c)) continue
      const end = c.startSec + c.durationSec
      const closesThePhase = end > closing.startSec && end >= closing.endSec - 2
      /* Already far enough past the voice: composed that way, left alone. */
      if (closesThePhase && end < leastEnd - EPS) {
        plan.stretched[c.id] = wantEnd - c.startSec
        plan.longer++
      }
    }
  }

  /* What the session now has to be long enough to contain. Read by the editor
     to grow `lengthSec`: a bed stretched past the end of the session would
     otherwise be cut off at exactly the moment this rule exists to protect. */
  if (plan.longer || plan.moved) {
    plan.sessionEnd = plan.closingEnd
    for (const t of tracks) {
      for (const c of t.clips) {
        const end = plan.stretched[c.id] !== undefined
          ? c.startSec + plan.stretched[c.id]
          : (plan.starts[c.id] ?? c.startSec) + c.durationSec
        plan.sessionEnd = Math.max(plan.sessionEnd, end)
      }
    }
  }
  return plan
}
