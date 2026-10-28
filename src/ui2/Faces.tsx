/* ============================================================================
   The five faces — the phone's check-in (Mobile.dc.html)

   A grid is a pointer instrument. On a phone, in one hand, it is five taps
   that each land on a fixed point of that same grid — so the colour engine,
   the quadrant and the four words are the same on both; only the way of
   saying it changes. The spec says this is intentional (brief §6.3).

   The points are the spec's, in src/mood/moodColor.ts, so the two
   instruments cannot drift apart: whatever the faces mean, they mean it
   through the same five pairs of numbers.
   ============================================================================ */

import { useI18n } from '../i18n'
import { useMood } from '../mood/MoodProvider'
import { FACE_POINTS, labelsFor, moodColor, moodWord } from '../mood/moodColor'

/* The mockup's five mouths, in order. */
const MOUTHS: Record<string, string> = {
  'very-bad': 'M8 16.5c2.5-2.5 5.5-2.5 8 0',
  bad: 'M8.5 16c2.2-1.4 4.8-1.4 7 0',
  neutral: 'M8.5 15h7',
  good: 'M8.5 14.5c2.2 1.6 4.8 1.6 7 0',
  'very-good': 'M8 14c2.5 3 5.5 3 8 0',
}

const LABELS: Record<string, string> = {
  'very-bad': 'Very bad',
  bad: 'Bad',
  neutral: 'Neutral',
  good: 'Good',
  'very-good': 'Very good',
}

export function Faces({ onClose }: { onClose(): void }) {
  const { t, locale } = useI18n()
  const mood = useMood()

  /* Which face is chosen: the one whose point is the committed point. */
  const chosen = FACE_POINTS.find(
    (f) => mood.mood && f.mood.valence === mood.mood.valence && f.mood.arousal === mood.mood.arousal,
  )

  const words = mood.mood ? labelsFor(mood.mood) : []

  return (
    <section className="fc2" aria-label={t('Emotional check-in')}>
      <p className="fc2__q">{t('How are you right now?')}</p>

      <div className="fc2__row" role="group" aria-label={t('Emotional check-in')}>
        {FACE_POINTS.map((f) => {
          const on = chosen?.id === f.id
          const colour = moodColor(f.mood).hex
          return (
            <button
              key={f.id}
              type="button"
              className="fc2__face"
              aria-label={t(LABELS[f.id])}
              aria-pressed={on}
              onClick={() => mood.commit(f.mood, null)}
              style={on ? { background: colour, color: '#06140f', borderColor: 'transparent' } : undefined}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                <circle cx="12" cy="12" r="9.5" />
                <circle cx="9" cy="10" r="0.6" fill="currentColor" />
                <circle cx="15" cy="10" r="0.6" fill="currentColor" />
                <path d={MOUTHS[f.id]} />
              </svg>
            </button>
          )
        })}
      </div>

      {/* The same four words as the grid, for the same reason: naming it is
          the part that does the work, and it only works in the language a
          person thinks in. */}
      {words.length > 0 && (
        <>
          <p className="fc2__q">{t('Which word fits best?')}</p>
          <div className="fc2__words">
            {words.map((id) => (
              <button
                key={id}
                type="button"
                className="fc2__word"
                aria-pressed={mood.label === id}
                onClick={() => { if (mood.mood) mood.commit(mood.mood, id); onClose() }}
              >
                {moodWord(id, locale)}
              </button>
            ))}
          </div>
        </>
      )}

      <button type="button" className="fc2__skip" onClick={() => { mood.skip(); onClose() }}>{t('Skip')}</button>
      <p className="fc2__note">{t('This stays on your screen. It is not saved and nobody else sees it.')}</p>
    </section>
  )
}
