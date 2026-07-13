/* ============================================================================
   Good Loop — WebRTC signalling seam
   The peer-connection logic (useVideoCall) talks to this interface only, so the
   transport for offer/answer/ICE is swappable:

     • createLoopbackPair() — two endpoints wired together IN THE SAME TAB. Used
       for the offline demo: the negotiation is real (actual RTCPeerConnections
       exchanging real SDP + ICE), only the message transport is in-process
       instead of over a network. Nothing about the media path is faked.

     • production — implement Signaling over Supabase Realtime (a channel per
       session id) or a WebSocket. A sketch is at the bottom. The call code does
       not change: it already speaks Signaling.
   ============================================================================ */

import { getSupabaseClient, hasSupabaseEnv } from '../../auth/supabaseClient'

export type SignalMessage =
  | { kind: 'offer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'answer'; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; candidate: RTCIceCandidateInit }

export interface Signaling {
  send(msg: SignalMessage): void
  onMessage(handler: (msg: SignalMessage) => void): void
  close(): void
}

class LoopbackEndpoint implements Signaling {
  private handler: ((msg: SignalMessage) => void) | null = null
  peer: LoopbackEndpoint | null = null
  private closed = false

  send(msg: SignalMessage): void {
    if (this.closed) return
    // Deliver asynchronously to mimic a network hop (and to avoid re-entrancy
    // during setLocalDescription/onicecandidate).
    const target = this.peer
    setTimeout(() => target?.deliver(msg), 0)
  }
  private deliver(msg: SignalMessage): void {
    if (!this.closed) this.handler?.(msg)
  }
  onMessage(handler: (msg: SignalMessage) => void): void {
    this.handler = handler
  }
  close(): void {
    this.closed = true
    this.handler = null
  }
}

/** Two signalling endpoints connected to each other, in-process. */
export function createLoopbackPair(): [Signaling, Signaling] {
  const a = new LoopbackEndpoint()
  const b = new LoopbackEndpoint()
  a.peer = b
  b.peer = a
  return [a, b]
}

/* ============================================================================
   Production transport — Supabase Realtime.
   A broadcast channel per session id carries offer/answer/ICE between the two
   peers; each endpoint tags messages with its role and ignores its own. This
   is the real cross-device signalling path: available whenever the app runs
   with Supabase env (hasRealtimeSignaling()), and consumed by the two-device
   call flow (therapist side + patient join screen) when that surface lands.
   The in-tab loopback above remains the default for the offline demo.
   ============================================================================ */


export type PeerRole = 'therapist' | 'patient'

/** True when the app has Supabase env — i.e. real signalling is possible. */
export function hasRealtimeSignaling(): boolean {
  return hasSupabaseEnv()
}

export function createRealtimeSignaling(sessionId: string, selfRole: PeerRole): Signaling {
  const url = import.meta.env.VITE_SUPABASE_URL as string
  const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string
  if (!url || !key) throw new Error('Realtime signalling needs VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.')

  const sb = getSupabaseClient(url, key)
  const channel = sb.channel(`rtc:${sessionId}`, { config: { broadcast: { self: false } } })

  let handler: ((m: SignalMessage) => void) | null = null
  const queued: SignalMessage[] = []
  let joined = false
  let closed = false

  channel
    .on('broadcast', { event: 'signal' }, ({ payload }) => {
      const p = payload as { from: PeerRole; msg: SignalMessage }
      if (p.from !== selfRole) handler?.(p.msg)
    })
    .subscribe((status) => {
      if (status === 'SUBSCRIBED' && !closed) {
        joined = true
        while (queued.length) {
          const msg = queued.shift()!
          void channel.send({ type: 'broadcast', event: 'signal', payload: { from: selfRole, msg } })
        }
      }
    })

  return {
    send(msg: SignalMessage): void {
      if (closed) return
      if (!joined) { queued.push(msg); return }  // buffer until the channel is live
      void channel.send({ type: 'broadcast', event: 'signal', payload: { from: selfRole, msg } })
    },
    onMessage(h: (m: SignalMessage) => void): void {
      handler = h
    },
    close(): void {
      closed = true
      handler = null
      void channel.unsubscribe()
    },
  }
}
