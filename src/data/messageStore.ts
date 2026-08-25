/* ============================================================================
   Good Loop — the patient/therapist thread

   Before this file there were two chats. The patient's app wrote into
   `gl.therapy`; the therapist's desktop wrote into `gl.workspace`. Both looked
   like they worked — text went in, a bubble appeared, it survived a reload —
   and neither one ever reached the other side. A patient could write "I had a
   bad week" and no therapist would ever see it.

   So there is one thread now, in one place, keyed by patient. Both ends read
   and write the same rows. What each end may do with them still differs:

   · Read state is per SIDE, not per message pair. `readByPatient` and
     `readByTherapist` are separate, because "the therapist has seen this" and
     "the patient has seen this" are different facts and a single `read` flag
     was quietly answering whichever question was asked last.
   · Nothing is ever deleted or edited. A therapeutic exchange is part of the
     clinical record; a message that can be silently revised is worth less than
     no message at all.
   · A message carries no protocol code, no score and no clinical vocabulary —
     that is the screens' job, but `MAX_LENGTH` is here so both ends agree on
     it rather than each inventing a limit.

   As with the assessment queue: localStorage is a demo stand-in for a table.
   Message content is health data and belongs server-side under LGPD, behind
   the therapist's account. This module is shaped so that swapping the two
   load/save functions for queries changes nothing above it.
   ============================================================================ */

import { useCallback, useEffect, useState } from 'react'

const KEY = 'gl.messages'

/** Long enough for a real paragraph, short enough that the thread stays a
    conversation rather than a channel for clinical notes. */
export const MAX_LENGTH = 1000

export type Side = 'patient' | 'therapist'

export interface ChatMessage {
  id: string
  patientId: string
  from: Side
  text: string
  at: number
  readByPatient: boolean
  readByTherapist: boolean
}

export function loadMessages(): ChatMessage[] {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as ChatMessage[]) : []
  } catch {
    return []
  }
}

export function saveMessages(rows: ChatMessage[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(rows))
  } catch {
    /* private mode */
  }
}

/* ------------------------------------------------------------- queries --- */

/** One patient's thread, oldest first — the order a conversation is read in. */
export function threadFor(rows: ChatMessage[], patientId: string): ChatMessage[] {
  return rows.filter((m) => m.patientId === patientId).sort((a, b) => a.at - b.at)
}

export function lastMessage(rows: ChatMessage[], patientId: string): ChatMessage | undefined {
  const t = threadFor(rows, patientId)
  return t[t.length - 1]
}

/**
 * How many messages `side` has not read.
 *
 * A side never has unread messages of its own — you have read what you just
 * wrote — so the sender is excluded rather than relying on the flag having
 * been set correctly at write time.
 */
export function unreadFor(rows: ChatMessage[], patientId: string, side: Side): number {
  return threadFor(rows, patientId).filter(
    (m) => m.from !== side && !(side === 'patient' ? m.readByPatient : m.readByTherapist),
  ).length
}

/** Every patient this side owes a reply to, most recently written first. */
export function threadsAwaiting(rows: ChatMessage[], side: Side): string[] {
  const ids = [...new Set(rows.map((m) => m.patientId))]
  return ids
    .filter((id) => unreadFor(rows, id, side) > 0)
    .sort((a, b) => (lastMessage(rows, b)?.at ?? 0) - (lastMessage(rows, a)?.at ?? 0))
}

/* -------------------------------------------------------------- writes --- */

let seq = 0
function newId(at: number): string {
  seq += 1
  return `m-${at.toString(36)}-${seq}`
}

/**
 * Post a message. Empty and whitespace-only text is refused by returning the
 * rows unchanged rather than throwing — a disabled Send button is the UI's
 * job, and a store that throws on a double-click is worse than one that
 * shrugs.
 */
export function send(
  rows: ChatMessage[],
  patientId: string,
  from: Side,
  text: string,
  at = Date.now(),
): ChatMessage[] {
  const body = text.trim().slice(0, MAX_LENGTH)
  if (!body) return rows
  return [
    ...rows,
    {
      id: newId(at),
      patientId,
      from,
      text: body,
      at,
      readByPatient: from === 'patient',
      readByTherapist: from === 'therapist',
    },
  ]
}

/** Mark this patient's thread read by one side. */
export function markRead(rows: ChatMessage[], patientId: string, side: Side): ChatMessage[] {
  return rows.map((m) =>
    m.patientId === patientId
      ? side === 'patient'
        ? { ...m, readByPatient: true }
        : { ...m, readByTherapist: true }
      : m,
  )
}

/**
 * Seed a thread that has no rows yet, once.
 *
 * The demo therapist writes first, as they would in life. It runs only when
 * the patient has no thread at all, so it can never appear on top of a real
 * conversation or duplicate itself on a re-render.
 */
export function seedThread(
  rows: ChatMessage[],
  patientId: string,
  text: string,
  at: number,
): ChatMessage[] {
  if (rows.some((m) => m.patientId === patientId)) return rows
  return send(rows, patientId, 'therapist', text, at)
}

/* --------------------------------------------------------------- hook ---- */

export function useMessages() {
  const [rows, setRows] = useState<ChatMessage[]>(() => loadMessages())

  /* Both ends of the thread run in the same build. Re-reading on focus and on
     the storage event is what makes a message sent from one surface show up on
     the other without a reload. */
  useEffect(() => {
    const reread = () => setRows(loadMessages())
    window.addEventListener('focus', reread)
    window.addEventListener('storage', reread)
    return () => {
      window.removeEventListener('focus', reread)
      window.removeEventListener('storage', reread)
    }
  }, [])

  const update = useCallback((fn: (rows: ChatMessage[]) => ChatMessage[]) => {
    setRows((prev) => {
      const next = fn(prev)
      saveMessages(next)
      return next
    })
  }, [])

  return { rows, update }
}
