import { useI18n } from '../i18n'

export function Loading({ label = 'Loading…' }: { label?: string }) {
  const { t } = useI18n()
  return (
    <div className="loading">
      <span className="loading__spin" aria-hidden="true" />
      <span>{t(label)}</span>
    </div>
  )
}
