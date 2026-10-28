import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { ElevenLabsNotice } from './components/ElevenLabsNotice'
import './index.css'
import './selfuse.css'
// the dark "Studio" restyle of the Self Use surface — must follow selfuse.css
import './selfuse-studio.css'
// the redesign (docs/ui-redesign). Scoped under `.gl-root`, so none of the two
// sheets above reaches it — it does not restyle them, it replaces them screen
// by screen. Last, so a name both define resolves here.
import './ui2/shell.css'
import './ui2/gamification.css'
import './ui2/profile.css'
import './ui2/mood.css'
// the three rooms: waiting, call, treatment
import './ui2/call.css'
import './corporate.css'
import './workspace.css'
// the therapist's console on the same surface (docs/ui-redesign)
import './ui2/workspace2.css'
// legal surfaces: Help now, the legal page, in-context notices (src/legal)
import './legal/legal.css'

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
    <ElevenLabsNotice />
  </StrictMode>,
)
