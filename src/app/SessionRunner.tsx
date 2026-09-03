import { useRef, useState } from 'react'
import { MoodScale } from '../components/MoodScale'
import { ImmersivePlayer } from '../screens/ImmersivePlayer'
import { PostSession } from '../screens/PostSession'
import { makeMoodFromVas } from '../lib/vas'
import { getProtocol, versionLengthSeconds } from '../data/protocols'
import { useI18n } from '../i18n'
import { patientTitle } from '../types/domain'
import type { MoodCheck, SessionRecord, Duration } from '../types/domain'
import { audioUrlFor } from '../data/liveCatalog'

interface SessionRunnerProps {
  protocolCode: string
  duration: Duration
  demoSeconds: number | null // override length for testing; null = full
  onDone: (record: SessionRecord) => void
  onCancel: () => void
}

/** Pre-mood (1 tap) → immersive session → result, then hands back a record. */
export function SessionRunner({ protocolCode, duration, demoSeconds, onDone, onCancel }: SessionRunnerProps) {
  const { t, locale } = useI18n()
  /* NO substitute protocol. This used to fall back to GL-ANX 1.1, so a
     prescription whose protocol had been renamed, disabled or deleted played
     a DIFFERENT clinical protocol under the prescribed one's name and looked
     like it had worked. The self-use player removed the same fallback for the
     same reason. The non-null assertion was a second bug hiding behind it:
     once the catalog became authoritative, a database without a GL-ANX 1.1
     row turned this line into a TypeError. */
  const protocol = getProtocol(protocolCode)
  /* The person's own language first, then whatever was rendered — a protocol
     published in Italian was invisible to a hardcoded 'pt-BR' read. */
  const audioUrl = protocol ? audioUrlFor(protocol, duration, locale) : undefined
  const totalSeconds = demoSeconds ?? (protocol ? versionLengthSeconds(protocol, duration) : duration * 60)

  const [stage, setStage] = useState<'pre' | 'play' | 'post'>('pre')
  const [vasPre, setVasPre] = useState<MoodCheck | null>(null)
  const startedAt = useRef(Date.now())

  /* Say so, rather than play something else. A prescription can outlive the
     protocol it names — renamed, disabled, deleted, or mid-reimport. */
  if (!protocol) {
    return (
      <div className="app-frame">
        <div className="screen screen--center">
          <div className="screen__body">
            <h2 className="display">{t('This session is not available')}</h2>
            <p className="lead">
              {t('The protocol behind it is no longer in the catalog. Your therapist can prescribe it again once it is republished.')}
            </p>
            <button className="btn btn--primary" onClick={onCancel}>{t('Go back')}</button>
          </div>
        </div>
      </div>
    )
  }

  function pickPre(v: number) {
    setVasPre(makeMoodFromVas(v))
    startedAt.current = Date.now()
    setTimeout(() => setStage('play'), 200)
  }

  function finish(post: MoodCheck | null) {
    onDone({
      id: `s-${startedAt.current}`,
      protocolCode,
      duration,
      startedAt: startedAt.current,
      completedAt: Date.now(),
      vasPre: vasPre ?? undefined,
      vasPost: post ?? undefined,
    })
  }

  if (stage === 'pre') {
    return (
      <div className="app-frame">
        <div className="screen">
          <button className="btn btn--quiet" style={{ alignSelf: 'flex-start' }} onClick={onCancel}>
            ← {t('Back')}
          </button>
          <div className="screen__body" style={{ justifyContent: 'center', gap: 28 }}>
            <div className="stack-md" style={{ textAlign: 'center' }}>
              <span className="eyebrow">{patientTitle(protocol)}</span>
              <h2 className="display">{t('How are you right now?')}</h2>
              <p className="muted small">{t('0 = not well at all · 10 = very well')}</p>
            </div>
            <MoodScale value={vasPre?.vas ?? null} onChange={pickPre} />
          </div>
        </div>
      </div>
    )
  }

  if (stage === 'play') {
    return (
      <div className="app-frame">
        <ImmersivePlayer
          protocol={protocol}
          totalSeconds={totalSeconds}
          audioUrl={audioUrl}
          isPlaceholderNote={!audioUrl}
          onComplete={() => setStage('post')}
        />
      </div>
    )
  }

  return (
    <div className="app-frame">
      <PostSession vasPre={vasPre ?? makeMoodFromVas(5)} onFinish={finish} doneLabel={'Back to home'} />
    </div>
  )
}
