/* ============================================================================
   Where a check-in goes

   One hook, so the three places that run a check-in — before a session,
   after one, and on its own from Home — cannot disagree about what is
   stored or about when storing is allowed.

   The consent rule is here and in the database, and the two say the same
   thing: without the measurement consent, nothing is written. The check-in
   still runs and still colours the app, on this device, for this person.
   Refusing to let someone check in because they declined a consent would be
   punishing them for the answer. See src/mood/config.ts for the standing
   legal question.
   ============================================================================ */

import { useCallback } from 'react'
import { useDataProvider } from '../data/provider'
import { useI18n } from '../i18n'
import { useLegal } from '../legal/LegalContext'
import { MOOD_CONSENT_PURPOSE, mayStoreMood } from './config'
import { moodColor } from './moodColor'
import { useMood, type MoodEntry } from './MoodContext'

export function useMoodRecorder(): { record: (e: MoodEntry) => void; stores: boolean } {
  const dp = useDataProvider()
  const legal = useLegal()
  const { locale } = useI18n()
  const { variant } = useMood()
  const stores = mayStoreMood(legal.consented(MOOD_CONSENT_PURPOSE))

  const record = useCallback(
    (e: MoodEntry) => {
      if (!stores) return
      void dp
        .recordMoodCheckin({
          at: e.at,
          context: e.context,
          sessionId: e.sessionId,
          protocolCode: e.protocolCode,
          valence: e.valence,
          arousal: e.arousal,
          labelId: e.labelId,
          locale,
          colorOklch: moodColor(e).oklch,
          variant,
        })
        /* Offline, or consent withdrawn between the question and the answer:
           the colour is already theirs and the app says nothing. A lost row
           is a lost row, not an error to put in front of someone who has
           just told us how they feel. */
        .catch(() => undefined)
    },
    [dp, locale, stores, variant],
  )

  return { record, stores }
}
