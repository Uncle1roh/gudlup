import { useRef, useState } from 'react'
import { EmojiScale } from '../components/EmojiScale'
import { ImmersivePlayer } from '../screens/ImmersivePlayer'
import { PostSession } from '../screens/PostSession'
import { makeMoodCheck } from '../lib/vas'
import { getProtocol, versionLengthSeconds } from '../data/protocols'
import { useI18n } from '../i18n'
import type { MoodCheck, SessionRecord, Duration } from '../types/domain'

interface SessionRunnerProps {
  protocolCode: string
  duration: Duration
  demoSeconds: number | null // override length for testing; null = full
  onDone: (record: SessionRecord) => void
  onCancel: () => void
}

/** Pre-mood (1 tap) → immersive session → result, then hands back a record. */
export function SessionRunner({ protocolCode, duration, demoSeconds, onDone, onCancel }: SessionRunnerProps) {
  const { t } = useI18n()
  const protocol = getProtocol(protocolCode) ?? getProtocol('GL-ANX 1.1')!
  const version = protocol.versions.find((v) => v.duration === duration)
  const audioUrl = version?.audioUrl?.['pt-BR']
  const totalSeconds = demoSeconds ?? versionLengthSeconds(protocol, duration)

  const [stage, setStage] = useState<'pre' | 'play' | 'post'>('pre')
  const [vasPre, setVasPre] = useState<MoodCheck | null>(null)
  const startedAt = useRef(Date.now())

  function pickPre(v: number) {
    setVasPre(makeMoodCheck(v))
    startedAt.current = Date.now()
    setTimeout(() => setStage('play'), 200)
  }

  function finish(post: MoodCheck | null) {
    onDone({
      id: `s-${startedAt.current}`,
      protocolCode: protocol.code,
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
              <span className="eyebrow">{protocol.title}</span>
              <h2 className="display">{t('How are you right now?')}</h2>
            </div>
            <EmojiScale value={vasPre?.emoji ?? null} onChange={pickPre} />
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
      <PostSession vasPre={vasPre ?? makeMoodCheck(3)} onFinish={finish} doneLabel={'Back to home'} />
    </div>
  )
}
