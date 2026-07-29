/* ============================================================================
   Good Loop — the B2C "protocol project" (self-guided program)
   The wizard identifies the person's cluster and entry protocol; from that
   the app builds the WHOLE family pathway and walks it one session at a
   time: finish GL-ANX 1.3 → the next session is GL-ANX 1.4 → … wrapping
   through the family until all five sub-protocols are done (the clinical
   model's sequence idea — weeks 1–3 on 1.1, then 1.3, 1.4, 1.5 — collapsed
   to per-session steps for the self-guided B2C; the therapist-managed
   pathway in Phase 2 keeps its own clinical pacing).

   State lives in localStorage (per device — the B2C MVP model):
     gl.program = { cluster, codes, index, duration, intensity, startedAt }
   ============================================================================ */

import { getProtocol, PROTOCOLS } from './protocols'
import type { WizardCluster, WizardResult } from './wizard'
import type { Duration, Protocol } from '../types/domain'

const KEY = 'gl.program'

export interface Program {
  cluster: WizardCluster
  /** The full family pathway, starting at the wizard's entry protocol. */
  codes: string[]
  /** Index of the NEXT session to play (0-based). codes.length = complete. */
  index: number
  /** The duration chosen in the wizard — the program's session length. */
  duration: Duration
  intensity: number | null
  startedAt: number
}

/** All codes of a family in numeric order (e.g. GL-ANX 1.1 … 1.5). */
function familyCodes(family: string): string[] {
  return PROTOCOLS
    .filter((p) => p.family === family)
    .map((p) => p.code)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
}

/** The pathway: start at the entry protocol, ascend through the family and
    wrap around, so the whole family is covered exactly once.
    Entry 1.3 → [1.3, 1.4, 1.5, 1.1, 1.2]. */
export function buildProgramCodes(entryCode: string): string[] {
  const family = entryCode.split(/\s+/)[0]
  const all = familyCodes(family)
  const i = all.indexOf(entryCode)
  if (i < 0) return all.length ? all : [entryCode]
  return [...all.slice(i), ...all.slice(0, i)]
}

export function startProgram(r: WizardResult): Program {
  const program: Program = {
    cluster: r.cluster,
    codes: buildProgramCodes(r.protocolCode),
    index: 0,
    duration: r.duration,
    intensity: r.intensity,
    startedAt: Date.now(),
  }
  save(program)
  return program
}

/** Replace the pathway from the ALTERNATIVE entry (the "didn't resonate?"
    fallback) — same cluster, fresh sequence starting at the alternative. */
export function switchProgramTo(entryCode: string): Program | null {
  const p = getProgram()
  if (!p) return null
  const next: Program = { ...p, codes: buildProgramCodes(entryCode), index: 0 }
  save(next)
  return next
}

export function getProgram(): Program | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const p = JSON.parse(raw) as Program
    if (!Array.isArray(p.codes) || typeof p.index !== 'number') return null
    return p
  } catch {
    return null
  }
}

export function clearProgram(): void {
  try { localStorage.removeItem(KEY) } catch { /* fine */ }
}

/** The next session of the program, or null when it is complete / absent. */
export function currentProgramStep(): { code: string; protocol: Protocol | undefined; step: number; total: number; duration: Duration } | null {
  const p = getProgram()
  if (!p || p.index >= p.codes.length) return null
  const code = p.codes[p.index]
  return { code, protocol: getProtocol(code), step: p.index + 1, total: p.codes.length, duration: p.duration }
}

export function programComplete(): boolean {
  const p = getProgram()
  return !!p && p.index >= p.codes.length
}

/** Called when a session finishes: if it was the program's current step,
    advance to the next sub-protocol. Sessions outside the program (repeat,
    explore) do not advance it. */
export function advanceProgramAfter(protocolCode: string): void {
  const p = getProgram()
  if (!p || p.index >= p.codes.length) return
  if (p.codes[p.index] !== protocolCode) return
  save({ ...p, index: p.index + 1 })
}

function save(p: Program): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)) } catch { /* private mode */ }
}
