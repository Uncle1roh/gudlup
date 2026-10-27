/* ============================================================================
   What the therapist prescribed, ready to draw

   Lifted out of TherapistTab unchanged when Percurso became a destination of
   its own. Same two sources, same precedence, same arithmetic:

     · the therapist's PLAN on the server, when there is one;
     · otherwise the link's own list, which is the demo's fallback.

   `done` is counted across the WHOLE prescription and `perWeek` is the
   weekly rhythm — printing one against the other produced "2 of 1 done".
   ============================================================================ */

import { useEffect, useMemo, useState } from 'react'
import { useDataProvider } from '../data/provider'
import { prescriptionsFromPlan, type Plan } from '../data/plan'
import { useCatalog } from '../data/liveCatalog'
import type { TherapyState } from '../selfuse/therapyStore'
import type { PrescriptionView } from './Path'

export function usePrescriptions(therapy: TherapyState): PrescriptionView[] {
  const dp = useDataProvider()
  const catalog = useCatalog()
  const [plan, setPlan] = useState<Plan | null>(null)

  useEffect(() => {
    let alive = true
    void dp.getMyPlan().then((p) => { if (alive) setPlan(p) }).catch(() => undefined)
    return () => { alive = false }
  }, [dp])

  const linked = therapy.link?.prescriptions

  return useMemo(() => {
    const fromPlan = prescriptionsFromPlan(plan)
    if (!fromPlan.length) return (linked ?? []).map((rx) => ({ ...rx, total: rx.perWeek }))
    return fromPlan.map((rx, i) => {
      const session = catalog.sessions.find((x) => x.protocolCode === rx.protocolCode)
      return {
        id: `plan-${rx.protocolCode}-${rx.duration}-${i}`,
        slug: session?.slug ?? '',
        duration: rx.duration,
        perWeek: rx.perWeek,
        done: rx.done,
        total: rx.total,
        status: (rx.done >= rx.total ? 'completed' : 'active') as 'active' | 'completed',
      }
    })
  }, [plan, linked, catalog.sessions])
}
