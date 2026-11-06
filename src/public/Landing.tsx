/* ============================================================================
   The landing: one screenful, seven words and a sentence

   There is nothing below the fold. No feature grid, no logos, no second
   call to action — the page is the photograph, the rings on the person in
   it, and a claim. Everything a prospect might want next is one of three
   words in the bar above.

   The subtitle exists twice. The long one is the claim in full and is set
   to break on two lines at a desk; the short one drops the final clause,
   because on a phone the long one is five lines of 16px over somebody's
   face. Which is used is decided in CSS by the one breakpoint this site
   has, not in JavaScript — a width query cannot be wrong about the width.
   ============================================================================ */

import { useI18n } from '../i18n'

export function Landing() {
  const { t } = useI18n()
  return (
    <section className="pub-land">
      <h1 className="pub-land__h1">
        {t('Calm in the middle')}{' '}
        <i className="pub-em">{t('of everything.')}</i>
      </h1>
      <p className="pub-land__sub pub-land__sub--long">
        {t('Guided audio sessions, with voice, music, nature and breath in layers, for your people to listen to whenever they need them.')}
      </p>
      <p className="pub-land__sub pub-land__sub--short">
        {t('Guided audio sessions, with voice, music, nature and breath in layers.')}
      </p>
    </section>
  )
}
