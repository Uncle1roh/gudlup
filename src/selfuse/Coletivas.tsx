/* ============================================================================
   Progress › Conquistas › Coletivas — SPEC §4.5

   The city a person chose, its goal for the month, the ranking of cities,
   states or regions by care per active person, and the collective badges.

   GAM-R5 throughout: the city is declared, never located; nothing counts
   without the geo_ranking consent; a city below its threshold shows no
   figure at all. PLAN A6: the person sees shares of a goal, ranks and
   their own minutes — never points. The ranking shows places only: the
   order is Points per active person, and printing any other number beside
   it would contradict the order. No names, no individuals, ever.
   ============================================================================ */

import { useCallback, useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { useDataProvider } from '../data/provider'
import { useLegal } from '../legal/LegalContext'
import { Icon } from './icons'
import { CityPicker } from './CityPicker'
import { copyFor } from '../gamification/copy'
import { fmtMinutes } from '../gamification/achievements'
import { cityLabel, REGION_NAMES, UF_NAMES, type CityCard, type GeoRanking, type GeoScope, type Municipality } from '../gamification/geo'

/** The consent wording, recorded with the choice exactly as the person read it. */
export const GEO_CONSENT_LABEL = 'Take part in the rankings'
export const GEO_CONSENT_NOTE = 'Your listening counts toward the city you choose. We only use the city you tell us — never your location.'

export function Coletivas() {
  const { t } = useI18n()
  const dp = useDataProvider()
  const legal = useLegal()
  const [card, setCard] = useState<CityCard | null | undefined>(undefined)
  const reload = useCallback(() => {
    dp.getMyCityCard().then((c) => setCard(c)).catch(() => setCard(null))
  }, [dp])
  useEffect(() => { reload() }, [reload])

  if (card === undefined) return null
  const joined = legal.consented('geo_ranking') && !!card?.city

  return (
    <>
      {joined && card ? <CityGoal card={card} /> : <OptIn initial={card?.city ?? null} onJoined={reload} />}
      {joined && <Rankings />}
      <p className="small muted gam-foot">
        {t('We use the city in your profile, never your location. You can leave the rankings in Profile.')}
      </p>
    </>
  )
}

/** Asked the first time Coletivas opens, and until the person answers. */
function OptIn({ initial, onJoined }: { initial: Municipality | null; onJoined: () => void }) {
  const { t } = useI18n()
  const dp = useDataProvider()
  const legal = useLegal()
  const [city, setCity] = useState<Municipality | null>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)

  async function join() {
    if (!city) return
    setBusy(true)
    setError(false)
    try {
      await dp.setMyCity(city.ibgeCode)
      await legal.setConsent('geo_ranking', true, `${t(GEO_CONSENT_LABEL)} — ${t(GEO_CONSENT_NOTE)}`)
      onJoined()
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card gam-optin">
      <h3 className="gam-optin__title">{t('Would you like your care to count toward your city?')}</h3>
      <p className="small muted">{t('We only use the city you tell us — never your location.')}</p>
      <CityPicker value={city} onPick={setCity} />
      <button className="btn btn--primary" disabled={!city || busy} onClick={() => void join()}>{t(GEO_CONSENT_LABEL)}</button>
      {error && <p className="small" role="alert">{t('That did not work. Please try again.')}</p>}
    </section>
  )
}

/** The violet card: the city's goal this month and the person's own part. */
function CityGoal({ card }: { card: CityCard }) {
  const { t } = useI18n()
  const share = card.goalShare
  return (
    <section className="gam-city" aria-label={t('Your city')}>
      <p className="gam-city__where"><Icon name="pin" size={18} /> {card.city && cityLabel({ name: card.city.name, uf: card.city.uf })}</p>
      <p className="gam-city__goal">{t('City goal: {name}', { name: t(copyFor(card.goalSlug).name) })}</p>
      {card.eligible && share !== null ? (
        <>
          <p className="gam-city__big">{t('{pct}% of the month’s goal', { pct: String(Math.floor(share * 100)) })}</p>
          <div className="gam-bar gam-bar--sand" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.floor(share * 100)}>
            <span style={{ width: `${share * 100}%` }} />
          </div>
        </>
      ) : (
        <p className="gam-city__wait">{t('Your city joins the rankings once enough people take part in the same month.')}</p>
      )}
      <p className="small">{t('Your part: {time} this month', { time: fmtMinutes(card.myMinutesMonth) })}</p>
    </section>
  )
}

/** Perfil › Privacidade: the declared city, changeable, under the toggle. */
export function ProfileCity() {
  const { t } = useI18n()
  const dp = useDataProvider()
  const [city, setCity] = useState<Municipality | null | undefined>(undefined)
  const [saved, setSaved] = useState(false)
  useEffect(() => {
    dp.getMyCityCard().then((c) => setCity(c?.city ?? null)).catch(() => setCity(null))
  }, [dp])
  if (city === undefined) return null
  return (
    <div className="gam-profile-city">
      <CityPicker
        value={city}
        onPick={(m) => {
          setSaved(false)
          void dp.setMyCity(m.ibgeCode).then(() => { setCity(m); setSaved(true) }).catch(() => setSaved(false))
        }}
      />
      {saved && <p className="small muted" role="status">{t('Saved.')}</p>}
    </div>
  )
}

const SCOPES: { id: GeoScope; label: string }[] = [
  { id: 'city', label: 'Cities' },
  { id: 'state', label: 'States' },
  { id: 'region', label: 'Regions' },
]

function Rankings() {
  const { t } = useI18n()
  const dp = useDataProvider()
  const [scope, setScope] = useState<GeoScope>('city')
  const [period, setPeriod] = useState<'month' | 'all'>('month')
  const [data, setData] = useState<GeoRanking | null>(null)

  useEffect(() => {
    let alive = true
    setData(null)
    dp.getGeoRankings(scope, period, 5).then((r) => { if (alive) setData(r) }).catch(() => { if (alive) setData(null) })
    return () => { alive = false }
  }, [dp, scope, period])

  const name = (ref: string, n: string | null, uf: string | null) =>
    scope === 'city' ? cityLabel({ name: n, uf, ref }) : scope === 'state' ? (UF_NAMES[ref] ?? ref) : t(REGION_NAMES[ref] ?? ref)
  const yours = scope === 'city' ? t('your city') : scope === 'state' ? t('your state') : t('your region')
  const mineOutside = data?.mine && data.mine.eligible && !data.rows.some((r) => r.mine)

  return (
    <section className="card gam-rank">
      <h3 className="home__sect">{t('Ranking · per active person')}</h3>
      <div className="chip-row chip-row--start" role="group" aria-label={t('Ranking')}>
        {SCOPES.map((s) => (
          <button key={s.id} className="chip" aria-pressed={scope === s.id} onClick={() => setScope(s.id)}>{t(s.label)}</button>
        ))}
      </div>
      <div className="segmented gam-seg" role="group" aria-label={t('Period')}>
        <button aria-pressed={period === 'month'} onClick={() => setPeriod('month')}>{t('This month')}</button>
        <button aria-pressed={period === 'all'} onClick={() => setPeriod('all')}>{t('All time')}</button>
      </div>
      {!data ? (
        <p className="small muted" aria-busy="true">{t('Loading…')}</p>
      ) : data.rows.length === 0 ? (
        <p className="small muted">{t('No ranking yet: a place appears once enough people take part.')}</p>
      ) : (
        <ol className="gam-rank__list">
          {data.rows.map((r) => (
            <li key={r.ref} className={r.mine ? 'is-mine' : undefined}>
              <span className="gam-rank__pos">{r.rank}</span>
              <span className="gam-rank__name">{name(r.ref, r.name, r.uf)}{r.mine && <em> · {yours}</em>}</span>
            </li>
          ))}
          {mineOutside && data.mine && (
            <li className="is-mine gam-rank__mine">
              <span className="gam-rank__pos">{data.mine.rank}</span>
              <span className="gam-rank__name">{name(data.mine.ref, data.mine.name, data.mine.uf)}<em> · {yours}</em></span>
            </li>
          )}
        </ol>
      )}
      {data?.mine && !data.mine.eligible && (
        <p className="small muted">{t('{place} is not in the ranking yet: it needs at least {n} active people in the period.', { place: name(data.mine.ref, data.mine.name, data.mine.uf), n: String(data.threshold) })}</p>
      )}
    </section>
  )
}
