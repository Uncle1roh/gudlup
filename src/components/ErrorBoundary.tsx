/* ============================================================================
   Good Loop — error boundary

   The app had none. React 18 unmounts the WHOLE tree when a render throws, so
   any single bad component left a white screen with no way back — including in
   the middle of a session, which is the worst possible moment in a product
   people use to calm down.

   Two things matter here beyond catching the error:

   · The copy. A patient mid-session must not meet a stack trace or the word
     "crash". They get a calm line and a way out. Technical detail is available
     but folded away, because the POs still need it when a tester reports
     something.
   · Recovery without losing the session. `resetKey` lets a parent clear the
     error when the route changes, so a crash in one surface does not require a
     reload of the whole app.
   ============================================================================ */

import { Component, type ErrorInfo, type ReactNode } from 'react'
import { BrandIcon } from './Brand'

interface Props {
  children: ReactNode
  /** Shown instead of the default panel — used to keep a crash inside one pane. */
  fallback?: (err: Error, reset: () => void) => ReactNode
  /** When this value changes the boundary clears itself (e.g. on route change). */
  resetKey?: unknown
  /** Where the failure happened, for the folded-away detail. */
  label?: string
}

interface State {
  error: Error | null
  info: string
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: '' }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // No telemetry service in this build; the console is what a tester can copy
    // out of the browser, and the folded panel below shows the same text.
    console.error(`[Good Loop] ${this.props.label ?? 'render'} failed:`, error, info.componentStack)
    this.setState({ info: info.componentStack ?? '' })
  }

  componentDidUpdate(prev: Props): void {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.reset()
  }

  reset = (): void => {
    this.setState({ error: null, info: '' })
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    if (this.props.fallback) return this.props.fallback(error, this.reset)

    return (
      <div className="eb">
        <div className="eb__card">
          <BrandIcon className="eb__mark" />
          <h1 className="eb__title">Qualcosa si è interrotto</h1>
          <p className="eb__body">
            Questa schermata non è riuscita a caricarsi. Nessun dato è andato perso:
            puoi riprovare, e se non funziona ricarica la pagina.
          </p>
          <div className="eb__actions">
            <button className="eb__btn eb__btn--go" onClick={this.reset}>Riprova</button>
            <button className="eb__btn" onClick={() => window.location.reload()}>Ricarica</button>
            <button
              className="eb__btn"
              onClick={() => { window.location.hash = ''; this.reset() }}
            >Torna all’inizio</button>
          </div>
          <details className="eb__det">
            <summary>Dettagli tecnici</summary>
            <pre className="eb__pre">{error.message}{this.state.info ? `\n${this.state.info}` : ''}</pre>
          </details>
        </div>
      </div>
    )
  }
}
