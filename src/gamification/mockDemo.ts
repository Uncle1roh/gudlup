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
import { DEMO_SESSIONS, demoListenedSec, demoSessionStart } from '../demo/world'

const DAY = 86_400_000
const HOUR = 3_600_000

export function seedDemoHistory(ledger: MockLedger, benefits: MockBenefits, now = Date.now()): void {
  const keep = ledger.settings.maxBackdateHours
  ledger.settings = { ...ledger.settings, maxBackdateHours: null }
  /* THE SAME SIXTEEN the person's own device keeps (`demo/world.ts`,
     `admin/preview.ts`). They used to be written out twice, here and in the
     preview seed, and the two lists disagreed — so the Loops pill said 542
     while the profile beside it said 78 minutes and the journey said there
     had been no sessions at all. One list, two readers. */
  DEMO_SESSIONS.forEach((s, i) => {
    const [, , min, completed] = s
    const start = demoSessionStart(s, now)
    const heard = demoListenedSec(s)
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
