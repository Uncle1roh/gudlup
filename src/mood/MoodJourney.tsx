/* ============================================================================
   The check-ins, on Minha jornada

   Three things, in this order:

     · the last fortnight as a row of colours, with the words under them —
       a person's own record of how they have been, and nothing else. No
       average, no trend line, no "you have been low this week": a figure
       like that is a judgement about somebody, and this product does not
       make those (MN-03, MN-19).
     · the most recent before/after pair from one session, if there is one.
     · a way to check in now.

   Rows arrive from the data layer, which only ever returns the reader's
   own. Nothing here is shared with an employer, by construction.
   ============================================================================ */

import { useCallback, useEffect, useState } from 'react'
import { fmtDate, useI18n } from '../i18n'
import { useDataProvider, type MoodCheckinRow } from '../data/provider'
import { moodColor, moodWord } from './moodColor'
import { MoodBeforeAfter } from './MoodBeforeAfter'
import { MoodCheckIn } from './MoodCheckIn'
import { useMoodRecorder } from './useMoodRecorder'

export function MoodJourney() {
  const { t, locale } = useI18n()
  const dp = useDataProvider()
  const { record, stores } = useMoodRecorder()
  const [rows, setRows] = useState<MoodCheckinRow[] | null>(null)
  const [open, setOpen] = useState(false)

  const load = useCallback(() => {
    void dp.listMyMoodCheckins(40).then(setRows).catch(() => setRows([]))
  }, [dp])
  useEffect(load, [load])

  /* The newest session where both ends were answered. Pairs are found by
     the correlation id the player minted, never by guessing from times. */
  const pair = (() => {
    if (!rows) return null
    const byId = new Map<string, { pre?: MoodCheckinRow; post?: MoodCheckinRow }>()
    for (const r of rows) {
      if (!r.sessionId) continue
      const slot = byId.get(r.sessionId) ?? {}
      if (r.context === 'pre_session') slot.pre = r
      if (r.context === 'post_session') slot.post = r
      byId.set(r.sessionId, slot)
    }
    for (const [, v] of byId) if (v.pre && v.post) return { before: v.pre, after: v.post }
    return null
  })()

  const recent = (rows ?? []).slice(0, 14)

  return (
    <section className="su-card mood-journey">
      <h3 className="mood-journey__title">{t('Your check-ins')}</h3>

      {rows !== null && !recent.length && (
        <p className="small muted">
          {t('A check-in takes about ten seconds: where you are, and a word for it. It is yours — nobody else sees it.')}
        </p>
      )}

      {recent.length > 0 && (
        <ol className="mood-journey__strip" aria-label={t('Your check-ins')}>
          {recent.map((r, i) => (
            <li key={r.id ?? `${r.at}-${i}`}>
              <span className="mood-journey__dot" style={{ background: moodColor(r).hex }} aria-hidden="true" />
              <span className="mood-journey__word">{moodWord(r.labelId, locale) || '—'}</span>
              <span className="mood-journey__day">{fmtDate(r.at, { day: 'numeric', month: 'short' })}</span>
            </li>
          ))}
        </ol>
      )}

      {pair && (
        <div className="mood-journey__pair">
          <p className="small">{t('Your last session, before and after')}</p>
          <MoodBeforeAfter
            before={{ valence: pair.before.valence, arousal: pair.before.arousal, labelId: pair.before.labelId }}
            after={{ valence: pair.after.valence, arousal: pair.after.arousal, labelId: pair.after.labelId }}
          />
        </div>
      )}

      {open ? (
        <MoodCheckIn
          context="standalone"
          notStored={!stores}
          onDismiss={() => setOpen(false)}
          onDone={(e) => { record(e); setOpen(false); window.setTimeout(load, 400) }}
        />
      ) : (
        <button className="btn btn--ghost" onClick={() => setOpen(true)}>{t('Check in now')}</button>
      )}
    </section>
  )
}
