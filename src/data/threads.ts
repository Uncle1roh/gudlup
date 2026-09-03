/* ============================================================================
   Good Loop — the live thread

   `messageStore` holds the SHAPE of a conversation and the pure queries over
   it (`threadFor`, `unreadFor`, `threadsAwaiting`). This holds the live one:
   the same rows, read from and written to the server through the data
   provider, so the two ends of a thread are two people rather than two tabs.

   What it replaces: a hook that read `localStorage['gl.messages']` and synced
   on the `storage` event. That worked beautifully within one browser and
   could never carry a message between two, which is the only thing a
   therapist and a patient ever need it to do.

   ── how it refreshes ────────────────────────────────────────────────────────
   On mount, on window focus, and on a slow interval. Deliberately not a
   realtime subscription: a therapeutic exchange is not an instant messenger —
   a therapist answers between appointments, not between keystrokes — and a
   socket per open tab is a cost with no clinical return. Sending refreshes
   immediately, so the writer never waits for the poll.
   ============================================================================ */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useDataProvider } from './provider'
import type { ChatMessage, Side } from './messageStore'

/** Slow on purpose — see the note above. */
const POLL_MS = 25_000

export interface LiveThreads {
  /** Every message this account may see, oldest first. */
  rows: ChatMessage[]
  /** False once the first read has come back — screens show their own empty
      state only after that, or an empty thread flashes before a full one. */
  loading: boolean
  /** Post to a thread. `patientId` is required only on the therapist's side. */
  send: (text: string, patientId?: string) => Promise<void>
  /** Mark what the other side wrote as seen. */
  markRead: (side: Side, patientId?: string) => Promise<void>
  refresh: () => void
}

export function useThreads(): LiveThreads {
  const dp = useDataProvider()
  const [rows, setRows] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(true)
  /* A refresh that lands after the component is gone must not set state, and
     a slow response must not overwrite a newer one. */
  const alive = useRef(true)
  const seq = useRef(0)

  const refresh = useCallback(() => {
    const mine = ++seq.current
    void dp.listThreads()
      .then((next) => {
        if (!alive.current || mine !== seq.current) return
        setRows(next)
      })
      .catch(() => { /* offline: keep what we have rather than blanking it */ })
      .finally(() => { if (alive.current && mine === seq.current) setLoading(false) })
  }, [dp])

  useEffect(() => {
    alive.current = true
    refresh()
    const onFocus = () => refresh()
    window.addEventListener('focus', onFocus)
    const id = window.setInterval(refresh, POLL_MS)
    return () => {
      alive.current = false
      window.removeEventListener('focus', onFocus)
      clearInterval(id)
    }
  }, [refresh])

  const send = useCallback(async (text: string, patientId?: string) => {
    const body = text.trim()
    if (!body) return
    await dp.sendMessage(body, patientId)
    refresh()
  }, [dp, refresh])

  const markRead = useCallback(async (side: Side, patientId?: string) => {
    /* The patient's own thread needs no id — their link supplies it — and a
       therapist must name the thread. Passing the wrong one round is how the
       old store marked the wrong side read. */
    await dp.markMessagesRead(side === 'therapist' ? patientId : undefined)
    refresh()
  }, [dp, refresh])

  return { rows, loading, send, markRead, refresh }
}
