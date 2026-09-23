/* ============================================================================
   The bar an admin carries through the other apps

   Rendered above every surface while preview is on, and nowhere else. It does
   three things: says plainly that the data is not real, moves between the
   surfaces without going back to the console first, and gets out.

   It says "dati dimostrativi" in every state. Sales will have this on screen
   in front of a customer, and a demo that quietly looks like production is how
   somebody ends up believing a number on it.
   ============================================================================ */

import { SURFACES, currentSurface, go, endPreview, type PreviewSurface } from './preview'

export function PreviewBar() {
  const here: PreviewSurface = currentSurface()
  return (
    <div className="pvw" role="region" aria-label="Anteprima amministratore">
      <span className="pvw__tag">Anteprima</span>
      <span className="pvw__note">dati dimostrativi — niente di reale viene letto o scritto</span>
      <nav className="pvw__nav">
        {SURFACES.map((s) => (
          <button
            key={s.id}
            className={`pvw__btn${here === s.id ? ' is-on' : ''}`}
            aria-current={here === s.id ? 'page' : undefined}
            onClick={() => (s.id === 'admin' ? endPreview() : go(s.id))}
          >
            {s.label}
          </button>
        ))}
      </nav>
      <button className="pvw__exit" onClick={endPreview}>Esci dall’anteprima</button>
    </div>
  )
}
