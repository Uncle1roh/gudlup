/* ============================================================================
   Reading a feature switch from a component

   `featureOn()` answers right now; this re-renders when the answer changes,
   which happens twice: when the first network read lands a second or so
   after the page opens, and when an admin flips a switch in another tab.
   ============================================================================ */

import { useEffect, useState } from 'react'
import { featureOn, onFeaturesChange, type FeatureId } from './features'

export function useFeature(id: FeatureId): boolean {
  const [on, setOn] = useState(() => featureOn(id))
  useEffect(() => onFeaturesChange(() => setOn(featureOn(id))), [id])
  return on
}
