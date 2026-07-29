/* Profile picture — one shared control for every surface (B2C profile,
   therapist topbar, employer topbar, admin sidebar). Shows the current
   picture (or a neutral fallback), and clicking it lets the person pick any
   image: it is center-cropped square and resized to 512 px JPEG in the
   browser (canvas) before upload, so a 12 MB phone photo becomes a ~60 kB
   avatar. Storage: the `avatars` bucket, one folder per user, own-folder
   RLS; mock mode keeps a local data-URL. */

import { useEffect, useRef, useState } from 'react'
import { useDataProvider } from '../data/provider'

interface AvatarUploadProps {
  /** Diameter in px. */
  size?: number
  /** Fallback glyph while no picture is set. */
  fallback?: string
  /** Extra class on the wrapper (for surface-specific spacing). */
  className?: string
  /** Read-only display (no upload affordance). */
  readOnly?: boolean
  title?: string
}

/** Center-crop to a square and resize to 512 px, encoded as JPEG. */
async function cropResize(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image()
      el.onload = () => res(el)
      el.onerror = () => rej(new Error('Could not read the image'))
      el.src = url
    })
    const side = Math.min(img.naturalWidth, img.naturalHeight)
    const sx = (img.naturalWidth - side) / 2
    const sy = (img.naturalHeight - side) / 2
    const out = Math.min(512, side)
    const canvas = document.createElement('canvas')
    canvas.width = out
    canvas.height = out
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, sx, sy, side, side, 0, 0, out, out)
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', 0.86))
    if (!blob) throw new Error('Could not encode the image')
    return blob
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function AvatarUpload({ size = 52, fallback = '🙂', className = '', readOnly = false, title }: AvatarUploadProps) {
  const dp = useDataProvider()
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    void dp.getMyAvatarUrl().then((u) => { if (alive) setUrl(u) }).catch(() => undefined)
    return () => { alive = false }
  }, [dp])

  async function onPick(file: File | undefined) {
    if (!file) return
    setBusy(true)
    setError(null)
    try {
      const blob = await cropResize(file)
      const newUrl = await dp.setMyAvatar(blob)
      setUrl(newUrl)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const style = { width: size, height: size }

  return (
    <span className={`avatarup ${className}`}>
      <button
        type="button"
        className={`avatarup__btn${busy ? ' is-busy' : ''}`}
        style={style}
        disabled={readOnly || busy}
        title={title ?? (readOnly ? undefined : 'Change profile picture')}
        onClick={() => inputRef.current?.click()}
      >
        {url
          ? <img className="avatarup__img" src={url} alt="" style={style} />
          : <span className="avatarup__fallback" style={{ fontSize: size * 0.5 }}>{fallback}</span>}
        {!readOnly && <span className="avatarup__badge" aria-hidden="true">✎</span>}
      </button>
      {!readOnly && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => void onPick(e.target.files?.[0])}
        />
      )}
      {error && <span className="avatarup__err" role="alert">{error}</span>}
    </span>
  )
}
