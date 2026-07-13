import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

/* After a redeploy, tabs opened before it still reference the previous build's
   hashed chunks; the first lazy import then 404s ("Failed to fetch dynamically
   imported module"). Vite signals that as 'vite:preloadError' — reload once to
   pick up the new build (time-guarded so a genuinely broken chunk can't cause
   a reload loop). */
window.addEventListener('vite:preloadError', (event) => {
  const KEY = 'gl.chunk-reload-at'
  const last = Number(sessionStorage.getItem(KEY) ?? 0)
  if (Date.now() - last < 30_000) return // already tried recently — surface the error instead
  event.preventDefault()
  sessionStorage.setItem(KEY, String(Date.now()))
  window.location.reload()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
