/* ============================================================================
   "How should the audio address you?"

   The guided voice speaks TO the listener, and Italian and Portuguese make
   the listener's gender audible: "sei pronto" / "sei pronta". One recording
   cannot do both, so every protocol is voiced twice and the app has to know
   which one to play.

   New accounts answer this on the registration form. This screen is for the
   accounts that existed BEFORE the female recordings did — every one of them
   has been hearing the male form, and the honest thing is to ask once rather
   than keep guessing. It is required: there is no correct default to fall
   back to, and skipping would silently keep calling somebody "pronto".

   It is not an identity question and the answer is not used as one. It picks
   a recording, it says so, and it is changeable in Profile for ever after.
   ============================================================================ */

import { useState } from 'react'
import { useI18n } from '../i18n'
import { BrandLogo } from '../components/Brand'
import type { Addressee } from '../tts/voiceLang'

export function AddressedAsGate({ onChoose }: { onChoose: (to: Addressee) => void }) {
  const { t } = useI18n()
  const [busy, setBusy] = useState<Addressee | null>(null)

  function choose(to: Addressee) {
    setBusy(to)
    onChoose(to)
  }

  return (
    <div className="app-frame su-studio">
      <div className="su-page fr adr">
        <div className="fr__top"><BrandLogo variant="cream" /></div>

        <div className="fr__words">
          <h1 className="display fr__title">{t('One question before you start')}</h1>
          <p className="fr__body">
            {t('The sessions speak to you directly, and the words change with how you are addressed. Which should we use?')}
          </p>
        </div>

        <div className="adr__choices">
          <button className="adr__choice" disabled={!!busy} onClick={() => choose('f')}>
            <b>{t('Femminile')}</b>
            <span>{t('“Trova una posizione comoda, quando sei pronta.”')}</span>
          </button>
          <button className="adr__choice" disabled={!!busy} onClick={() => choose('m')}>
            <b>{t('Maschile')}</b>
            <span>{t('“Trova una posizione comoda, quando sei pronto.”')}</span>
          </button>
        </div>

        <p className="fr__fine">
          {t('It chooses which recording you hear — nothing else. You can change it any time in Profile → Session preferences.')}
        </p>
      </div>
    </div>
  )
}
