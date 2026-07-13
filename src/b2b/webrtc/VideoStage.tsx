import { useEffect, useRef } from 'react'
import { useVideoCall, type CallState } from './useVideoCall'

const CALL_LABEL: Record<CallState, string> = {
  idle: 'Not connected',
  connecting: 'Connecting…',
  connected: 'Live',
  failed: 'Connection failed',
}

export function VideoStage({ patientName, intervening }: { patientName: string; intervening: boolean }) {
  const call = useVideoCall()
  const localRef = useRef<HTMLVideoElement>(null)
  const remoteRef = useRef<HTMLVideoElement>(null)

  useEffect(() => { if (localRef.current) localRef.current.srcObject = call.localStream }, [call.localStream])
  useEffect(() => { if (remoteRef.current) remoteRef.current.srcObject = call.remoteStream }, [call.remoteStream])

  const connected = call.callState === 'connected'

  return (
    <div className="vstage">
      {/* patient (remote) feed fills the stage */}
      <div className="vstage__main">
        {connected && call.remoteStream ? (
          <video ref={remoteRef} className="vstage__video" autoPlay playsInline />
        ) : (
          <div className="vstage__placeholder">
            {call.callState === 'connecting'
              ? <><span className="vstage__spin" /><span>Connecting to {patientName}…</span></>
              : call.callState === 'failed'
                ? <><span className="vstage__icon">⚠</span><span>Connection failed</span><button className="b2b-btn b2b-btn--primary" onClick={call.connectPatient}>Retry</button></>
                : <><span className="vstage__icon">🎥</span><span>{patientName} is ready to join</span>
                    <button className="b2b-btn b2b-btn--primary" disabled={call.camStatus !== 'live'} onClick={call.connectPatient}>Connect patient</button>
                    {call.camStatus !== 'live' && <span className="b2b-sub">enable your camera first</span>}
                  </>}
          </div>
        )}

        {/* connection state pill */}
        <div className={`vstage__pill vstage__pill--${call.callState}`}>
          <span className="vstage__pilldot" /> {CALL_LABEL[call.callState]}
        </div>
        {connected && intervening && <div className="vstage__live">🔴 two-way audio open</div>}

        {/* therapist self-view */}
        <div className="vstage__self">
          {call.camStatus === 'live' ? (
            <>
              <video ref={localRef} className={`vstage__video ${call.camOn ? '' : 'is-off'}`} autoPlay playsInline muted />
              {!call.camOn && <span className="vstage__selfoff">Camera off</span>}
              <span className="vstage__selflabel">You</span>
            </>
          ) : call.camStatus === 'starting' ? (
            <div className="vstage__selfmsg"><span className="vstage__spin" /></div>
          ) : (
            <div className="vstage__selfmsg">
              <span>{call.camStatus === 'denied' ? 'Camera blocked' : 'No camera'}</span>
              <button className="vstage__retry" onClick={call.startCamera}>Retry</button>
            </div>
          )}
        </div>
      </div>

      {/* controls */}
      <div className="vstage__controls">
        <button className={`vctl ${call.camOn ? '' : 'is-off'}`} disabled={call.camStatus !== 'live'} onClick={call.toggleCam} title="Camera">
          {call.camOn ? '📷' : '🚫'} <span>Cam</span>
        </button>
        <button className={`vctl ${call.micOn ? '' : 'is-off'}`} disabled={call.camStatus !== 'live'} onClick={call.toggleMic} title="Microphone">
          {call.micOn ? '🎙' : '🔇'} <span>Mic</span>
        </button>
        {connected
          ? <button className="vctl vctl--end" onClick={call.hangup}>✕ <span>End</span></button>
          : <button className="vctl vctl--go" disabled={call.camStatus !== 'live' || call.callState === 'connecting'} onClick={call.connectPatient}>↗ <span>Connect</span></button>}
      </div>

      {call.simulated && !connected && (
        <p className="vstage__note">Demo: the patient feed is simulated in-tab over a real WebRTC connection. Production swaps in signalling (Supabase Realtime) with no change to the call code.</p>
      )}
    </div>
  )
}
