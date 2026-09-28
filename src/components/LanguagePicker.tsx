/* The interface language, chosen by the person.

   One control for every surface that has a place for it — the Self Use
   Profile, the therapist workspace's settings, the employer dashboard, the
   sign-in doors and the legal page — so the choice is made the same way
   everywhere and lands in the same place (`gl.locale`, app-wide). The admin
   console does not offer it: it is pinned to Italian (see FixedLocale). */

import { useI18n, LOCALES, type Locale } from '../i18n'

export function LanguagePicker({ className, label = true }: { className?: string; label?: boolean }) {
  const { t, locale, setLocale } = useI18n()
  const select = (
    <select
      className={className}
      value={locale}
      aria-label={t('Language')}
      onChange={(e) => setLocale(e.target.value as Locale)}
    >
      {LOCALES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
    </select>
  )
  if (!label) return select
  return (
    <label className="lang-picker">
      <span className="lang-picker__label">{t('Language')}</span>
      {select}
    </label>
  )
}
