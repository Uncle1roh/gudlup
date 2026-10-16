/* ============================================================================
   What a person sees where a switched-off area used to be

   Not an error. An error screen says something went wrong just now and
   invites a retry; this says a part of the app is deliberately unavailable
   and retrying will not help. The difference matters to the person standing
   in front of it, and it matters to support, who otherwise receive a week of
   reports about a bug nobody is fixing because it is not a bug.

   It never names the cause. "Maintenance" is honest and enough; the reason
   an area is off is operational and sometimes commercially sensitive, and a
   person waiting to listen to a session is not helped by it.
   ============================================================================ */

import { useI18n } from '../i18n'

export function FeatureOff({ area, onBack }: { area: 'player' | 'booking' | 'video'; onBack?: () => void }) {
  const { t } = useI18n()
  const line: Record<typeof area, string> = {
    player: 'Sessions are temporarily unavailable while we fix something. Nothing you have done is lost.',
    booking: 'Booking is temporarily unavailable while we fix something. Appointments you already have are unaffected.',
    video: 'Video calls are temporarily unavailable while we fix something. Your appointment is still booked — your therapist will be in touch.',
  }
  return (
    <div className="su-page ftoff" role="status">
      <div className="ftoff__box">
        <div className="ftoff__mark" aria-hidden="true">⏸</div>
        <h2 className="ftoff__title">{t('Temporarily unavailable')}</h2>
        <p className="ftoff__note">{t(line[area])}</p>
        <p className="ftoff__sub">{t('Please try again later.')}</p>
        {onBack && (
          <button className="btn btn--primary ftoff__back" onClick={onBack}>{t('Back')}</button>
        )}
      </div>
    </div>
  )
}
