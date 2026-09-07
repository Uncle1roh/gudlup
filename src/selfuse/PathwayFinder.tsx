/* ============================================================================
   Self Use — "help me choose"

   The four intake questions, and what they suggest.

   They used to be ON-4 and ON-5 of a seven-screen onboarding that stood
   between registering and ever seeing the app: everyone answered them, once,
   before they knew what the answers were for. Now nobody is asked anything —
   a person lands on the library and browses — and these are here for the one
   who opens the Pathways rail and does not know which to pick.

   That changes what they are. A gate has to be answered; an offer has to be
   worth accepting. So it can be closed at any point, every question can be
   skipped, and the result is phrased as a suggestion with the other pathways
   one tap away — because a recommendation from four questions is a starting
   point, not a diagnosis, and the app should not pretend otherwise.
   ============================================================================ */

import { useState } from 'react'
import { useI18n } from '../i18n'
import {
  INTAKE_CHALLENGES,
  INTAKE_MATTERS,
  INTAKE_TIMES,
  DURATIONS,
  pathwayById,
  type IntakeTime,
  type IntakeMatter,
} from '../data/selfuse'
import { suggestedPathway } from '../data/selfUseStore'
import type { PathwayId } from '../data/selfuse'
import type { Duration } from '../types/domain'
import { Icon } from './icons'

export function PathwayFinder({
  onClose,
  onChoose,
}: {
  onClose: () => void
  /** Open the suggested pathway. Starting it is still the person's decision,
      taken on the pathway's own screen where they can read what it is. */
  onChoose: (id: PathwayId) => void
}) {
  const { t } = useI18n()
  const [challenge, setChallenge] = useState<string | null>(null)
  const [duration, setDuration] = useState<Duration | null>(null)
  const [time, setTime] = useState<IntakeTime | null>(null)
  const [matters, setMatters] = useState<IntakeMatter | null>(null)
  const [done, setDone] = useState(false)

  const answered = [challenge, duration, time, matters].filter(Boolean).length
  const suggestion = suggestedPathway({ challenge, duration, time, matters })
  const pathway = pathwayById(suggestion)
  /* "I'm not sure yet" routes to the most universal starting point, and the
     result says so rather than presenting a guess as a reading. */
  const unsure = challenge === 'unsure' || answered < 4

  if (done && pathway) {
    return (
      <div className="su-page finder">
        <button className="su-back" onClick={onClose}>‹ {t('Back')}</button>
        <div className="finder__result">
          <span className="eyebrow">{t('Recommended for you')}</span>
          <h1 className="display su-h1">{t(pathway.name)}</h1>
          <p className="lead">
            {t(pathway.about)} {t('{len}, {per} sessions per week.', { len: t(pathway.lengthLabel), per: pathway.perWeekLabel })}
          </p>
          <p className="small muted">{t('~{n} min per session', { n: duration ?? pathway.duration })}</p>
          {unsure && (
            <p className="small muted">
              {t("We've suggested this as a great starting point. You can explore other pathways anytime.")}
            </p>
          )}
          <div className="btn-stack">
            <button className="btn btn--primary" onClick={() => onChoose(suggestion)}>
              {t('See this pathway')}
            </button>
            <button className="btn btn--ghost" onClick={() => setDone(false)}>{t('Change my answers')}</button>
            <button className="btn btn--quiet" onClick={onClose}>{t('See all pathways')}</button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="su-page finder">
      <button className="su-back" onClick={onClose}>‹ {t('Back')}</button>
      <div className="ob-qhead">
        <h1 className="display su-h1">{t('Help me choose')}</h1>
        <span className="ob-qcount">{t('{n} of 4', { n: answered })}</span>
      </div>
      <p className="lead">{t('Four questions, and we will point you at a pathway. Skip any of them.')}</p>

      <fieldset className="ob-q">
        <legend className="field-label">{t("What's your main challenge right now?")}</legend>
        <div className="ob-optlist">
          {INTAKE_CHALLENGES.map((o) => (
            <button key={o.id} className="ob-opt" aria-pressed={challenge === o.id} onClick={() => setChallenge(o.id)}>
              <span className="ob-opt__icon" aria-hidden="true"><Icon name={o.icon} size={20} /></span>
              <span className="ob-opt__label">{t(o.label)}</span>
              <span className="ob-radio" aria-hidden="true" />
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="ob-q">
        <legend className="field-label">{t('How much time can you dedicate to yourself?')}</legend>
        <div className="ob-optlist">
          {DURATIONS.map((d) => (
            <button key={d} className="ob-opt" aria-pressed={duration === d} onClick={() => setDuration(d)}>
              <span className="ob-opt__icon" aria-hidden="true"><Icon name="clock" size={20} /></span>
              <span className="ob-opt__label">{t('{n} minutes', { n: d })}</span>
              <span className="ob-radio" aria-hidden="true" />
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="ob-q">
        <legend className="field-label">{t('When would you prefer your session?')}</legend>
        <div className="ob-optlist">
          {INTAKE_TIMES.map((o) => (
            <button key={o.id} className="ob-opt" aria-pressed={time === o.id} onClick={() => setTime(o.id)}>
              <span className="ob-opt__icon" aria-hidden="true"><Icon name="clock" size={20} /></span>
              <span className="ob-opt__label">{t(o.label)}</span>
              <span className="ob-radio" aria-hidden="true" />
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="ob-q">
        <legend className="field-label">{t('What matters most to you right now?')}</legend>
        <div className="ob-optlist">
          {INTAKE_MATTERS.map((o) => (
            <button key={o.id} className="ob-opt" aria-pressed={matters === o.id} onClick={() => setMatters(o.id)}>
              <span className="ob-opt__icon" aria-hidden="true"><Icon name="spark" size={20} /></span>
              <span className="ob-opt__label">{t(o.label)}</span>
              <span className="ob-radio" aria-hidden="true" />
            </button>
          ))}
        </div>
      </fieldset>

      {/* Never disabled. A gate needs four answers; an offer works with one,
          and "I'm not sure" is itself an answer the suggestion understands. */}
      <button className="btn btn--primary" onClick={() => setDone(true)}>
        {answered ? t('Show me a pathway') : t('Just suggest something')}
      </button>
    </div>
  )
}
