import type { SessionRecord, Duration } from '../types/domain'
import { makeMoodCheck } from '../lib/vas'

/* Mock data so the returning-user app has something to show before persistence
   and real history exist. Replaced by real records as sessions are completed. */

const DAY = 86_400_000
const now = Date.now()

function rec(daysAgo: number, code: string, duration: Duration, pre: number, post: number): SessionRecord {
  const started = now - daysAgo * DAY
  return {
    id: `seed-${daysAgo}-${code}`,
    protocolCode: code,
    duration,
    startedAt: started,
    completedAt: started + duration * 60_000,
    vasPre: { ...makeMoodCheck(pre), at: started },
    vasPost: { ...makeMoodCheck(post), at: started + duration * 60_000 },
  }
}

export const SEED_HISTORY: SessionRecord[] = [
  rec(18, 'GL-ANX 1.1', 6, 2, 4),
  rec(16, 'GL-ANX 1.1', 6, 2, 4),
  rec(14, 'GL-STRESS 4.1', 12, 3, 4),
  rec(11, 'GL-ANX 1.1', 12, 2, 5),
  rec(9, 'GL-ANX 1.1', 12, 3, 5),
  rec(6, 'GL-DEP 2.4', 6, 3, 4),
  rec(3, 'GL-ANX 1.1', 12, 3, 5),
  rec(1, 'GL-ANX 1.1', 12, 4, 5),
]

/* The 3-month journey (weekly cadence). */
export const JOURNEY_TOTAL_WEEKS = 12
export const JOURNEY_WEEKS_DONE = 3
export const JOURNEY_SESSIONS_PER_WEEK = 3

export function lastSession(history: SessionRecord[]): { protocolCode: string; duration: Duration } {
  const last = history[history.length - 1]
  return last
    ? { protocolCode: last.protocolCode, duration: last.duration }
    : { protocolCode: 'GL-ANX 1.1', duration: 6 }
}

/** A single, time-of-day-aware suggestion (the one "For you today" card). */
export function todayRecommendation(): { code: string; reason: string } {
  const h = new Date().getHours()
  if (h >= 21 || h < 5) return { code: 'GL-ANX 1.1', reason: 'Wind down before sleep' }
  if (h < 11) return { code: 'GL-DEP 2.4', reason: 'A gentle start to the day' }
  if (h < 17) return { code: 'GL-STRESS 4.1', reason: 'Reset your focus' }
  return { code: 'GL-ANX 1.1', reason: 'Ease into the evening' }
}

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Still up?'
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}
