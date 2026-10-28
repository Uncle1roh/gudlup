/* ============================================================================
   The city picker — SPEC §4.2. A searchable list by name, "Campinas · SP".

   The city is something the person TELLS us. Nothing here asks the device
   where it is, and nothing ever will (GAM-R5).
   ============================================================================ */

import { useEffect, useId, useState } from 'react'
import { useI18n } from '../i18n'
import { useDataProvider } from '../data/provider'
import { cityLabel, type Municipality } from '../gamification/geo'

export function CityPicker({ value, onPick }: { value: Municipality | null; onPick: (m: Municipality) => void }) {
  const { t } = useI18n()
  const dp = useDataProvider()
  const id = useId()
  const [q, setQ] = useState('')
  const [hits, setHits] = useState<Municipality[]>([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return }
    let alive = true
    setBusy(true)
    const timer = window.setTimeout(() => {
      dp.searchMunicipalities(q)
        .then((rows) => { if (alive) setHits(rows) })
        .catch(() => { if (alive) setHits([]) })
        .finally(() => { if (alive) setBusy(false) })
    }, 220)
    return () => { alive = false; window.clearTimeout(timer) }
  }, [q, dp])

  return (
    <div className="gam-city-picker">
      <label className="small" htmlFor={id}>{t('Your city')}</label>
      {value && <p className="gam-city-picker__current">{cityLabel({ name: value.name, uf: value.uf })}</p>}
      <input
        id={id}
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t('Type the name of your city')}
        autoComplete="off"
        aria-describedby={`${id}-hint`}
      />
      {/* What you typed brings its matches up directly under the field. They
          used to come up under the privacy line, which put a sentence
          between the thing being answered and the answers. */}
      {hits.length > 0 && (
        <ul className="gam-city-picker__list" role="listbox" aria-label={t('Cities')}>
          {hits.map((m) => (
            <li key={m.ibgeCode}>
              <button type="button" role="option" aria-selected={value?.ibgeCode === m.ibgeCode} onClick={() => { onPick(m); setQ(''); setHits([]) }}>
                {cityLabel({ name: m.name, uf: m.uf })}
              </button>
            </li>
          ))}
        </ul>
      )}
      {!busy && q.trim().length >= 2 && hits.length === 0 && <p className="small muted">{t('No city found with that name.')}</p>}
      <p id={`${id}-hint`} className="small muted">{t('We only use the city you tell us — never your location.')}</p>
    </div>
  )
}
