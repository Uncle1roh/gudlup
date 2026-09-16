import { useEffect, useState } from 'react'
import { ELEVENLABS_REQUEST_EVENT, type ElevenLabsRequestInfo } from '../tts/requestNotice'

/** How long one warning stays up. */
const VISIBLE_MS = 4000

interface Item extends ElevenLabsRequestInfo {
  id: number
}

/**
 * A warning for every paid request sent to ElevenLabs, stacked in the corner
 * and gone after a few seconds. Mounted once at the root so it covers every
 * surface that can synthesize: the Studio, the Excel importer, previews.
 */
export function ElevenLabsNotice() {
  const [items, setItems] = useState<Item[]>([])

  useEffect(() => {
    const onRequest = (e: Event) => {
      const detail = (e as CustomEvent<ElevenLabsRequestInfo>).detail
      const id = detail.count
      setItems((prev) => [...prev.slice(-3), { ...detail, id }])
      window.setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), VISIBLE_MS)
    }
    window.addEventListener(ELEVENLABS_REQUEST_EVENT, onRequest)
    return () => window.removeEventListener(ELEVENLABS_REQUEST_EVENT, onRequest)
  }, [])

  if (!items.length) return null
  return (
    <div className="el-notice" role="status" aria-live="polite">
      {items.map((i) => (
        <div key={i.id} className="el-notice__item">
          <strong>⚠ Richiesta inviata a ElevenLabs</strong>
          <span>
            {i.chars} caratteri{i.lines > 1 ? ` · ${i.lines} frasi in una richiesta` : ''} · n. {i.count} da quando hai aperto la pagina
          </span>
        </div>
      ))}
    </div>
  )
}
