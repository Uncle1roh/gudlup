/* ============================================================================
   Who the empty hash belongs to

   One URL, two readings. For a stranger, `/` is the landing page — the
   photograph, the claim, and three words in a bar. For somebody signed in it
   is their library, as it has always been: a returning person opens the app,
   not a sales page, and nothing about this round may put a marketing page
   between them and it.

   Only this component knows both halves, because it is the first thing
   inside `AuthProvider` on that route and therefore the first that can ask
   whether anybody is signed in. The router above it has no idea; the pages
   below it do not need one.

   THE THREE INNER PAGES ARE PUBLIC TO EVERYONE, signed in or not. They are
   marketing pages about the product, and an HR manager who follows a link
   to "O método" from an e-mail should read it rather than be bounced into
   their dashboard.
   ============================================================================ */

import { useEffect, type ReactNode } from 'react'
import { useAuth } from '../auth/auth'
import { useI18n } from '../i18n'
import { navigate, R_LANDING, type Stage } from '../components/ambient/stage'
import { PublicSite } from './PublicSite'

export function PublicRoute({ stage, children }: { stage: Stage; children: ReactNode }) {
  const { ready, user } = useAuth()
  const { t } = useI18n()

  /* Already signed in and standing at the door: there is nothing here for
     them. Sent to the app's own hash, where the gate takes over and, if the
     account belongs to another surface, forwards it again.

     `navigate`, NOT `location.href`. This fires a fraction of a second
     after a successful sign-in — the account lands before the hash does —
     and a real navigation there reloads the page, which throws away the
     background mid-animation: the rings never leave the person, because
     the element doing the travelling is gone. It cost the whole of 10.3
     and it looked like the animation had simply not been built. */
  const sendHome = ready && !!user && stage === 'login'
  useEffect(() => {
    if (sendHome) navigate('')
  }, [sendHome])

  /* The wait. Not the landing — a signed-in person reloading their library
     would see a sales page flash first — and not the app either, because
     nothing is known yet. The door's own spinner, which is what every other
     surface shows at this moment. */
  if (!ready || sendHome) {
    return (
      <div className="auth auth--loading auth--b2c su-studio">
        <div className="auth__spin" aria-label={t('Loading')} />
      </div>
    )
  }

  /* The three pages anybody may read. */
  if (stage === 'como' || stage === 'empresas' || stage === 'metodo') {
    return <PublicSite stage={stage} />
  }

  if (stage === 'login') {
    /* `children` is the gate. Signed out, it renders the door — which is
       styled for this shell (`auth--hero`, in index.css) and shares the
       photograph and the breathing rings with the landing. */
    return <PublicSite stage="login" door={children} />
  }

  /* The empty hash. */
  return user ? <>{children}</> : <PublicSite stage="landing" />
}

export { R_LANDING }
