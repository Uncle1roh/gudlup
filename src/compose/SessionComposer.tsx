import { useMemo, useRef, useState } from 'react'
import {
  FAMILY_LABEL, FAMILY_DEFAULT_WAVE, FAMILY_AFFIRMATION,
  BRAINWAVE, SOUNDSCAPE_LABEL, LENGTH_MIN,
  type ComposeSettings, type Length, type Soundscape, type Brainwave,
} from './types'
import type { ProtocolFamily, Duration } from '../types/domain'
import { buildSeed, renderPreviewBlob } from './engine'
import { setStudioSeed } from './handoff'
import { useI18n } from '../i18n'

export interface ComposeResult {
  settings: ComposeSettings
  protocolCode: string
  durationMin: Duration
}

const FAMILY_CODE: Record<ProtocolFamily, string> = {
  'GL-ANX': 'GL-ANX 1.1', 'GL-DEP': 'GL-DEP 2.4', 'GL-BURN': 'GL-BURN 3.1',
  'GL-STRESS': 'GL-STRESS 4.1', 'GL-RESIL': 'GL-RESIL 5.1',
}
const FAMILIES = Object.keys(FAMILY_LABEL) as ProtocolFamily[]
const LENGTHS: Length[] = ['quick', 'standard', 'deep']
const SOUNDSCAPES: Soundscape[] = ['lake', 'air', 'deep']
const WAVES: Brainwave[] = ['delta', 'theta', 'alpha', 'smr']
const LENGTH_LABEL: Record<Length, string> = { quick: 'Quick', standard: 'Standard', deep: 'Deep' }

interface Props {
  context: 'b2c' | 'b2b'
  initialFamily?: ProtocolFamily
  patientName?: string
  onUse: (r: ComposeResult) => void
  onCancel: () => void
}

export function SessionComposer({ context, initialFamily = 'GL-ANX', patientName, onUse, onCancel }: Props) {
  const { t } = useI18n()
  const [family, setFamily] = useState<ProtocolFamily>(initialFamily)
  const [length, setLength] = useState<Length>('standard')
  const [soundscape, setSoundscape] = useState<Soundscape>('lake')
  const [brainwave, setBrainwave] = useState<Brainwave>(FAMILY_DEFAULT_WAVE[initialFamily])
  const [voiceOn, setVoiceOn] = useState(true)
  const [affirmation, setAffirmation] = useState(FAMILY_AFFIRMATION[initialFamily])
  const [intensity, setIntensity] = useState(0.6)
  const [busy, setBusy] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  const wide = typeof window !== 'undefined' && window.innerWidth >= 1024

  const settings: ComposeSettings = useMemo(
    () => ({ family, length, soundscape, brainwave, voiceOn, affirmation, intensity }),
    [family, length, soundscape, brainwave, voiceOn, affirmation, intensity],
  )

  function chooseFamily(f: ProtocolFamily) {
    setFamily(f)
    setBrainwave(FAMILY_DEFAULT_WAVE[f])
    setAffirmation(FAMILY_AFFIRMATION[f])
    clearPreview()
  }
  function clearPreview() {
    setPreviewUrl((u) => { if (u) URL.revokeObjectURL(u); return null })
    setPlaying(false)
  }

  async function generate() {
    setBusy(true)
    try {
      const blob = await renderPreviewBlob(buildSeed(settings))
      setPreviewUrl((u) => { if (u) URL.revokeObjectURL(u); return URL.createObjectURL(blob) })
      window.setTimeout(() => { void audioRef.current?.play(); setPlaying(true) }, 60)
    } finally {
      setBusy(false)
    }
  }
  function togglePlay() {
    const a = audioRef.current; if (!a) return
    if (a.paused) { void a.play(); setPlaying(true) } else { a.pause(); setPlaying(false) }
  }
  async function exportWav() {
    const blob = await renderPreviewBlob(buildSeed(settings), 30)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${family.toLowerCase()}_${length}_goodloop.wav`; a.click()
    URL.revokeObjectURL(url)
  }
  function openInStudio() {
    setStudioSeed(buildSeed(settings), `${FAMILY_CODE[family]} — ${FAMILY_LABEL[family]} (${LENGTH_LABEL[length]})`)
    window.location.hash = '#studio'
  }
  function use() {
    onUse({ settings, protocolCode: FAMILY_CODE[family], durationMin: LENGTH_MIN[length] })
  }

  return (
    <div className={`cmp cmp--${context}`}>
      <div className="cmp__head">
        <button className="cmp__back" onClick={onCancel}>← {t('Back')}</button>
        <div>
          <h1 className="cmp__title">{t('Compose a session')}</h1>
          <p className="cmp__sub">
            {patientName ? `${t('For {name}', { name: patientName })} · ` : ''}{t('Pick a few presets — no timeline needed.')}
            {wide ? ` ${t('Fine-tune in the Studio if you want.')}` : ''}
          </p>
        </div>
      </div>

      <div className="cmp__grid">
        <section className="cmp__group">
          <h2 className="cmp__lbl">{t('Focus')}</h2>
          <div className="cmp__seg cmp__seg--wrap">
            {FAMILIES.map((f) => (
              <button key={f} className={family === f ? 'is-on' : ''} onClick={() => chooseFamily(f)}>{t(FAMILY_LABEL[f])}</button>
            ))}
          </div>
        </section>

        <section className="cmp__group">
          <h2 className="cmp__lbl">{t('Length')}</h2>
          <div className="cmp__seg">
            {LENGTHS.map((l) => (
              <button key={l} className={length === l ? 'is-on' : ''} onClick={() => setLength(l)}>
                {t(LENGTH_LABEL[l])} <span className="cmp__min">{LENGTH_MIN[l]}m</span>
              </button>
            ))}
          </div>
        </section>

        <section className="cmp__group">
          <h2 className="cmp__lbl">{t('Soundscape')}</h2>
          <div className="cmp__seg">
            {SOUNDSCAPES.map((sc) => (
              <button key={sc} className={soundscape === sc ? 'is-on' : ''} onClick={() => { setSoundscape(sc); clearPreview() }}>{t(SOUNDSCAPE_LABEL[sc])}</button>
            ))}
          </div>
        </section>

        <section className="cmp__group">
          <h2 className="cmp__lbl">{t('Brainwave')} <span className="cmp__hint">{t(BRAINWAVE[brainwave].note)}</span></h2>
          <div className="cmp__seg">
            {WAVES.map((w) => (
              <button key={w} className={brainwave === w ? 'is-on' : ''} onClick={() => { setBrainwave(w); clearPreview() }}>
                {BRAINWAVE[w].label} <span className="cmp__min">{BRAINWAVE[w].beatHz}Hz</span>
              </button>
            ))}
          </div>
        </section>

        <section className="cmp__group cmp__group--wide">
          <div className="cmp__voicehead">
            <h2 className="cmp__lbl">{t('Guiding voice')}</h2>
            <button className={`cmp__switch${voiceOn ? ' is-on' : ''}`} onClick={() => { setVoiceOn((v) => !v); clearPreview() }} aria-label={t('Toggle voice')}>
              <span />
            </button>
          </div>
          {voiceOn && <>
            <textarea className="cmp__text" rows={2} value={affirmation} onChange={(e) => { setAffirmation(e.target.value); clearPreview() }} />
            <p className="cmp__note">{t('Preview uses a placeholder voice — synthesize the real spoken voice in the Studio.')}</p>
          </>}
        </section>

        <section className="cmp__group cmp__group--wide">
          <h2 className="cmp__lbl">{t('Intensity')} <b>{Math.round(intensity * 100)}%</b></h2>
          <input className="cmp__range" type="range" min={0} max={1} step={0.05} value={intensity} onChange={(e) => { setIntensity(+e.target.value); clearPreview() }} />
        </section>
      </div>

      {/* preview */}
      <div className="cmp__preview">
        <audio ref={audioRef} src={previewUrl ?? undefined} onEnded={() => setPlaying(false)} />
        {!previewUrl ? (
          <button className="cmp__gen" onClick={generate} disabled={busy}>{busy ? t('Building…') : `♪ ${t('Generate preview')}`}</button>
        ) : (
          <div className="cmp__player">
            <button className="cmp__play" onClick={togglePlay}>{playing ? '❚❚' : '►'}</button>
            <span className="cmp__pmeta">{t('Preview')} · {t(FAMILY_LABEL[family])} · {BRAINWAVE[brainwave].label}</span>
            <button className="cmp__regen" onClick={generate} disabled={busy}>{busy ? '…' : '↻'}</button>
            <button className="cmp__exp" onClick={exportWav}>{t('Export WAV')}</button>
          </div>
        )}
      </div>

      {/* actions */}
      <div className="cmp__actions">
        {wide && <button className="cmp__studio" onClick={openInStudio}>{t('Open in Studio')} →</button>}
        <button className="cmp__use" onClick={use}>
          {context === 'b2b' ? `${t('Use for this session')} →` : `${t('Start this session')} →`}
        </button>
      </div>
    </div>
  )
}
