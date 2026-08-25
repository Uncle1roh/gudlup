/* ============================================================================
   Video surfaces for the new layouts

   `src/b2b/webrtc/VideoStage.tsx` renders the same streams inside the LEGACY
   console's layout, with its own chrome and its own Italian copy. The two new
   surfaces have different layouts entirely — 70/30 on the therapist's desktop,
   full-bleed on the patient's phone — so they attach the same streams to their
   own elements rather than embedding a component that brings a layout with it.

   What lives here is only the part that must not be re-derived per surface:
   binding a `MediaStream` to a `<video>` element, and the states that are not
   "a picture" — no camera, permission denied, not yet connected.
   ============================================================================ */

import { useEffect, useRef } from 'react'
import { useI18n } from '../i18n'
import type { VideoCall } from '../b2b/webrtc/useVideoCall'

/**
 * The remote peer, filling its container.
 *
 * `srcObject` cannot be set as a JSX attribute — it takes a MediaStream, not a
 * URL — so it is assigned in an effect whenever the stream identity changes.
 */
export function PeerVideo({
  call,
  fallbackInitials,
  label,
}: {
  call: VideoCall
  fallbackInitials: string
  label: string
}) {
  const ref = useRef<HTMLVideoElement>(null)
  const { t } = useI18n()

  useEffect(() => {
    if (ref.current) ref.current.srcObject = call.remoteStream
  }, [call.remoteStream])

  const live = call.callState === 'connected' && call.remoteStream

  return (
    <div className="w-video__feed">
      {live ? (
        <video ref={ref} className="w-video__el" autoPlay playsInline />
      ) : (
        <>
          <span className="w-avatar w-avatar--xl">{fallbackInitials}</span>
          <span className="w-small">
            {call.callState === 'connecting' ? t('Connecting…') : call.callState === 'failed' ? t('Connection failed') : label}
          </span>
          {call.callState === 'failed' && (
            <button className="w-btn w-btn--ghost" onClick={call.connectPatient}>{t('Retry')}</button>
          )}
        </>
      )}
      <div className={`w-video__pill is-${call.callState}`}>
        <span className="w-video__dot" />
        {call.callState === 'connected'
          ? t('Live')
          : call.callState === 'connecting'
            ? t('Connecting…')
            : call.callState === 'failed'
              ? t('Connection failed')
              : t('Not connected')}
        {call.realtime && !call.simulated && <span className="w-video__mode"> · {t('real room')}</span>}
        {call.simulated && call.callState === 'connected' && <span className="w-video__mode"> · {t('simulated')}</span>}
      </div>
    </div>
  )
}

/** The therapist's own camera. Muted, always — hearing yourself is a headache. */
export function SelfVideo({ call, className }: { call: VideoCall; className: string }) {
  const ref = useRef<HTMLVideoElement>(null)
  const { t } = useI18n()

  useEffect(() => {
    if (ref.current) ref.current.srcObject = call.localStream
  }, [call.localStream])

  return (
    <div className={className}>
      {call.camStatus === 'live' ? (
        <>
          <video ref={ref} className={`w-video__el${call.camOn ? '' : ' is-off'}`} autoPlay playsInline muted />
          {!call.camOn && <span className="w-video__selfoff">{t('Camera off')}</span>}
        </>
      ) : call.camStatus === 'starting' ? (
        <span className="w-spinner" aria-hidden="true" />
      ) : (
        <span className="w-small">{call.camStatus === 'denied' ? t('Camera blocked') : t('No camera')}</span>
      )}
    </div>
  )
}
