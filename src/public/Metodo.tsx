/* ============================================================================
   O método — the eight layers, named on the waterfall

   The photograph is the argument: a cascade made of many separate threads
   of water that you hear as one sound. Eight labels sit on eight of those
   threads, and the button under them lights the labels one at a time, 650ms
   apart, so the idea arrives in the order a session builds.

   NOTHING PLAYS. The button is called "Ouvir as camadas" and it reveals
   labels — it does not start audio. That is deliberate and it is the brief's
   call: there is no cleared public extract (see `config/publicSite.ts`), and
   a button that promises sound and gives none would be the worst thing on
   the page. The label is the brief's own wording and the POs own it; if it
   should read "Ver as camadas" instead, that is one string.

   The five numbers are what the catalogue actually contains and they are
   written here rather than counted from the live library on purpose: a
   public page that recomputed them would read "0 técnicas" on a bad
   deployment, and the numbers are a claim about the METHOD, not a count of
   today's rows.
   ============================================================================ */

import { useEffect, useRef, useState } from 'react'
import { useI18n } from '../i18n'
import { heroSrc } from '../components/ambient/AmbientBackground'

/** The eight layers and where each one sits on the picture, as percentages
    of the frame. The last two are out on the right-hand fall and are the
    ones a phone has no room for. */
const LAYERS: { key: string; left: number; top: number }[] = [
  { key: 'Guide voice', left: 7.5, top: 30 },
  { key: 'Music and nature', left: 12.5, top: 12 },
  { key: 'Binaural beats', left: 18.4, top: 42 },
  { key: 'Bilateral stimulation', left: 25.6, top: 20 },
  { key: 'Breath cues', left: 33.8, top: 36 },
  { key: 'Word echo', left: 42.5, top: 8 },
  { key: 'Background whisper', left: 49.7, top: 25 },
  { key: 'Anchor phrase', left: 88.1, top: 18 },
]

const STATS: { value: string; label: string }[] = [
  { value: '7', label: 'approaches with a scientific basis' },
  { value: '9', label: 'audio tools' },
  { value: '112', label: 'techniques' },
  { value: 'up to 8', label: 'layers of sound at the same time' },
  { value: '6', label: 'phases per session' },
]

const REVEAL_MS = 650

export function Metodo() {
  const { t } = useI18n()
  /* null = every label at rest and fully visible. A number = the reveal is
     running and that many are lit so far. */
  const [lit, setLit] = useState<number | null>(null)
  const timer = useRef<number | null>(null)

  /* The interval is cleared on unmount, and on a second press — otherwise
     two runs would race each other down the same counter. */
  useEffect(() => () => { if (timer.current) window.clearInterval(timer.current) }, [])

  function reveal(): void {
    if (timer.current) window.clearInterval(timer.current)
    setLit(0)
    timer.current = window.setInterval(() => {
      setLit((n) => {
        const next = (n ?? 0) + 1
        if (next >= LAYERS.length) {
          if (timer.current) { window.clearInterval(timer.current); timer.current = null }
          /* Back to rest rather than to "all eight lit", so pressing it
             again starts from the same place it did the first time. */
          return null
        }
        return next
      })
    }, REVEAL_MS)
  }

  return (
    <article className="pub-page">
      <p className="pub-eyebrow">{t('The method')}</p>
      <h1 className="pub-h1">
        {t('Many layers.')}{' '}
        <i className="pub-em">{t('One single experience.')}</i>
      </h1>
      <p className="pub-sub">
        {t('Every session layers voice, music, nature and breath, following a structured method drawn from approaches with a scientific basis.')}
      </p>

      <div
        className="pub-frame"
        role="img"
        aria-label={t('A waterfall of many threads of water, each one standing for a layer of sound')}
        style={{ backgroundImage: `url(${heroSrc()})` }}
      >
        <div className="pub-frame__veil" aria-hidden="true" />
        {LAYERS.map((l, i) => (
          <span
            key={l.key}
            className={`pub-layer${i >= 6 ? ' pub-layer--far' : ''}`}
            style={{
              left: `${l.left}%`,
              top: `${l.top}%`,
              opacity: lit === null ? 1 : i < lit ? 1 : 0.12,
            }}
          >
            {t(l.key)}
          </span>
        ))}
        <button type="button" className="pub-frame__btn" onClick={reveal}>
          <span className="pub-frame__play" aria-hidden="true" />
          {t('Hear the layers')}
        </button>
      </div>

      <dl className="pub-stats">
        {STATS.map((s) => (
          <div className="pub-stat" key={s.label}>
            <dt className="pub-stat__v">{t(s.value)}</dt>
            <dd className="pub-stat__l">{t(s.label)}</dd>
          </div>
        ))}
      </dl>

      <section className="pub-card pub-card--wide">
        <h2 className="pub-card__h pub-card__h--lg">{t('Inspired by approaches such as')}</h2>
        <p className="pub-card__t">
          {t('Mindfulness, polyvagal theory, EMDR, NLP, DBT, imagery therapy and meditation, brought together in an audio experience structured in 6 phases.')}
        </p>
      </section>

      <p className="pub-fine">{t('Wellbeing content. It does not replace psychological or medical care.')}</p>
    </article>
  )
}
