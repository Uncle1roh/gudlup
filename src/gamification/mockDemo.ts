/* ============================================================================
   The demo person's history — so a walkthrough opens on a lived-in app.

   This exists ONLY in the demo data (the mock provider: no backend
   configured, or an admin's preview from the console). A real deployment
   never sees it: the live database carries configuration (plans, tags,
   templates, achievement definitions), never a demo person, a demo session
   or a demo redemption.

   Three weeks of listening, credited through the same rules as everything
   else: mixed lengths, a few evenings and lunch breaks, two early stops.
   Every achievement it unlocks is marked seen except the most recent, so
   the unlock sheet greets the walkthrough. One benefit already redeemed,
   so "Meus benefícios" has something in it.
   ============================================================================ */

import type { MockLedger } from './mockLedger'
import type { MockBenefits } from './mockBenefits'

const DAY = 86_400_000
const HOUR = 3_600_000

export function seedDemoHistory(ledger: MockLedger, benefits: MockBenefits, now = Date.now()): void {
  const keep = ledger.settings.maxBackdateHours
  ledger.settings = { ...ledger.settings, maxBackdateHours: null }
  /* [days ago, hour of day in São Paulo (UTC−3), minutes, completed] */
  const plan: [number, number, 6 | 12 | 24, boolean][] = [
    [20, 21, 12, true], [19, 12, 6, true], [17, 22, 24, true], [16, 13, 12, true], [15, 8, 6, false],
    [13, 21, 24, true], [12, 12, 12, true], [11, 22, 12, true], [9, 13, 6, true], [8, 21, 24, true],
    [6, 12, 12, true], [5, 7, 24, false], [4, 22, 12, true], [3, 13, 6, true], [2, 21, 24, true], [1, 12, 12, true],
  ]
  plan.forEach(([ago, hour, min, completed], i) => {
    const day = new Date(now - ago * DAY)
    const start = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour + 3, 5)
    const heard = completed ? min * 60 : Math.round(min * 60 * 0.45)
    ledger.creditSession({
      id: `demo-${i}`, protocolCode: 'DEMO', duration: min, startedAt: start, completedAt: start + heard * 1000,
      completed, listenedSec: heard, stereoChecked: i === 0,
    }, start + heard * 1000 + HOUR)
  })
  ledger.settings = { ...ledger.settings, maxBackdateHours: keep }

  const unlocked = ledger.achievements().filter((a) => a.unlockedAt !== null).sort((a, b) => (a.unlockedAt ?? 0) - (b.unlockedAt ?? 0))
  ledger.markSeen(unlocked.slice(0, -1).map((a) => a.id), now - HOUR)

  try { benefits.redeem('pausa1', false, now - 2 * DAY) } catch { /* not affordable in an edited demo: fine */ }
}
