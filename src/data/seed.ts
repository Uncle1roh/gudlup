import type { SessionRecord, Duration } from '../types/domain'
import { makeMoodCheck } from '../lib/vas'
import { SELF_USE_SESSIONS } from './selfuse'
import { DEMO_SESSIONS, demoSessionStart } from '../demo/world'

/* Mock data so the returning-user app has something to show before persistence
   and real history exist. Replaced by real records as sessions are completed. */

const now = Date.now()


/* THE SAME SESSIONS, SERVER-SIDE. This is what `listSessions` returns — the
   clinician's view of her patient, and what the app merges into the device's
   own log. It used to be eight invented records with different dates and
   different protocols from the sixteen in `demo/world.ts`, so the demo
   person had two histories: 22 sessions and 276 minutes in her profile, for
   a month in which she had done 14.

   One list now (`DEMO_SESSIONS`), mapped from session slug to the protocol
   code behind it — which is the join the clinical record is keyed on. The
   VAS pair either side of each one wanders a little rather than improving
   every time: a demo that draws a cure is a demo that promises one. */
const VAS_PAIRS: [number, number][] = [[2, 4], [3, 4], [2, 5], [3, 5], [3, 4], [2, 4], [4, 5], [3, 5]]

export const SEED_HISTORY: SessionRecord[] = DEMO_SESSIONS
  .filter(([, , , done]) => done)
  .map((session, i) => {
    const [, , duration, , slug] = session
    const code = SELF_USE_SESSIONS.find((x) => x.slug === slug)?.protocolCode ?? 'GL-ANX 1.1'
    const started = demoSessionStart(session, now)
    const [pre, post] = VAS_PAIRS[i % VAS_PAIRS.length]
    return {
      id: `seed-${i}-${code}`,
      protocolCode: code,
      duration,
      startedAt: started,
      completedAt: started + duration * 60_000,
      vasPre: { ...makeMoodCheck(pre), at: started },
      vasPost: { ...makeMoodCheck(post), at: started + duration * 60_000 },
    }
  })

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
