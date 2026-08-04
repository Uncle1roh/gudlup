import { useEffect, useRef } from 'react'
import type { CallState, VideoCall } from './useVideoCall'

const CALL_LABEL: Record<CallState, string> = {
  idle: 'Non connesso',
  connecting: 'Connessione…',
  connected: 'In diretta',
  failed: 'Connessione fallita',
}

interface Props {
  /** The call is owned by the room, so it can also send session control. */
  call: VideoCall
  /** Label for the remote peer (the patient for the therapist, and vice versa). */
  peerName: string
  intervening?: boolean
  /** Patient side: no "call" button, and no simulated-peer escape hatch. */
  answerOnly?: boolean
}

export function VideoStage({ call, peerName, intervening = false, answerOnly = false }: Props) {
  const localRef = useRef<HTMLVideoElement>(null)
  const remoteRef = useRef<HTMLVideoElement>(null)

  useEffect(() => { if (localRef.current) localRef.current.srcObject = call.localStream }, [call.localStream])
  useEffect(() => { if (remoteRef.current) remoteRef.current.srcObject = call.remoteStream }, [call.remoteStream])

  const connected = call.callState === 'connected'

  return (
    <div className="vstage">
      {/* the remote feed fills the stage */}
      <div className="vstage__main">
        {connected && call.remoteStream ? (
          <video ref={remoteRef} className="vstage__video" autoPlay playsInline />
        ) : (
          <div className="vstage__placeholder">
            {call.callState === 'connecting'
              ? <><span className="vstage__spin" /><span>Connessione a {peerName}…</span></>
              : call.callState === 'failed'
                ? <><span className="vstage__icon">⚠</span><span>Connessione fallita</span>
                    {!answerOnly && <button className="b2b-btn b2b-btn--primary" onClick={call.connectPatient}>Riprova</button>}
                  </>
                : answerOnly
                  ? <><span className="vstage__icon">🎥</span>
                      <span>{call.peerPresent ? `${peerName} sta per avviare la videochiamata…` : `In attesa di ${peerName}…`}</span>
                      <span className="b2b-sub">Resta su questa schermata: la chiamata si apre da sola.</span>
                    </>
                  : <><span className="vstage__icon">🎥</span>
                      <span>
                        {call.realtime
                          ? (call.peerPresent ? `${peerName} è in sala d'attesa` : `In attesa che ${peerName} entri…`)
                          : `${peerName} è pronto a entrare`}
                      </span>
                      <button
                        className="b2b-btn b2b-btn--primary"
                        disabled={call.camStatus !== 'live' || (call.realtime && !call.peerPresent)}
                        onClick={call.connectPatient}
                      >
                        Chiama il paziente
                      </button>
                      {call.camStatus !== 'live' && <span className="b2b-sub">attiva prima la tua videocamera</span>}
                      {call.realtime && !call.peerPresent && (
                        <button className="vstage__sim" onClick={call.connectSimulated} disabled={call.camStatus !== 'live'}>
                          Demo · simula il paziente
                        </button>
                      )}
                    </>}
          </div>
        )}

        {/* connection state pill */}
        <div className={`vstage__pill vstage__pill--${call.callState}`}>
          <span className="vstage__pilldot" /> {CALL_LABEL[call.callState]}
          {call.realtime && !call.simulated && <span className="vstage__mode"> · sala reale</span>}
        </div>
        {connected && intervening && <div className="vstage__live">🔴 audio bidirezionale aperto</div>}

        {/* self-view */}
        <div className="vstage__self">
          {call.camStatus === 'live' ? (
            <>
              <video ref={localRef} className={`vstage__video ${call.camOn ? '' : 'is-off'}`} autoPlay playsInline muted />
              {!call.camOn && <span className="vstage__selfoff">Videocamera spenta</span>}
              <span className="vstage__selflabel">Tu</span>
            </>
          ) : call.camStatus === 'starting' ? (
            <div className="vstage__selfmsg"><span className="vstage__spin" /></div>
          ) : (
            <div className="vstage__selfmsg">
              <span>{call.camStatus === 'denied' ? 'Videocamera bloccata' : 'Nessuna videocamera'}</span>
              <button className="vstage__retry" onClick={call.startCamera}>Riprova</button>
            </div>
          )}
        </div>
      </div>

      {/* controls */}
      <div className="vstage__controls">
        <button className={`vctl ${call.camOn ? '' : 'is-off'}`} disabled={call.camStatus !== 'live'} onClick={call.toggleCam} title="Videocamera">
          {call.camOn ? '📷' : '🚫'} <span>Video</span>
        </button>
        <button className={`vctl ${call.micOn ? '' : 'is-off'}`} disabled={call.camStatus !== 'live'} onClick={call.toggleMic} title="Microfono">
          {call.micOn ? '🎙' : '🔇'} <span>Micro</span>
        </button>
        {connected
          ? <button className="vctl vctl--end" onClick={call.hangup}>✕ <span>Chiudi</span></button>
          : !answerOnly && (
              <button className="vctl vctl--go" disabled={call.camStatus !== 'live' || call.callState === 'connecting'} onClick={call.connectPatient}>
                ↗ <span>Chiama</span>
              </button>
            )}
      </div>

      {call.simulated && !connected && !answerOnly && (
        <p className="vstage__note">
          {call.realtime
            ? 'Sala reale attiva: il paziente entra dalla sua app e la chiamata passa da Supabase Realtime. Il feed simulato resta disponibile per le demo su un solo dispositivo.'
            : 'Demo: il feed del paziente è simulato in questa scheda su una connessione WebRTC reale. In produzione il segnale passa da Supabase Realtime, senza modifiche al codice della chiamata.'}
        </p>
      )}
    </div>
  )
}
