/* ============================================================================
   Before and after, side by side

   The spec calls this "o feedback mais compreensível para o usuário e o nosso
   dado de eficácia". Two colours and two words: what you brought to the
   session, and what you left with.

   It states the change and never explains it. A session is not claimed to
   have caused anything, and the colour is not claimed to have done anything
   at all — the honest sentence is "this is what you said, then and now".
   ============================================================================ */

import { useI18n } from '../i18n'
import { moodColor, moodWord, type Mood } from './moodColor'

export interface MoodSnapshot extends Mood {
  labelId: string | null
}

export function MoodBeforeAfter({ before, after }: { before: MoodSnapshot; after: MoodSnapshot }) {
  const { t, locale } = useI18n()
  const a = moodColor(before)
  const b = moodColor(after)

  return (
    <div className="mood-ba">
      <div className="mood-ba__pair">
        <div className="mood-ba__one">
          <span className="mood-ba__swatch" style={{ background: a.hex }} aria-hidden="true" />
          <span className="mood-ba__when">{t('Before')}</span>
          <span className="mood-ba__word">{moodWord(before.labelId, locale) || t('no word')}</span>
        </div>
        <span className="mood-ba__arrow" aria-hidden="true">→</span>
        <div className="mood-ba__one">
          <span className="mood-ba__swatch" style={{ background: b.hex }} aria-hidden="true" />
          <span className="mood-ba__when">{t('After')}</span>
          <span className="mood-ba__word">{moodWord(after.labelId, locale) || t('no word')}</span>
        </div>
      </div>
    </div>
  )
}
