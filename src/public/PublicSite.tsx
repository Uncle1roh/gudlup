/* ============================================================================
   The public site: a header, four pages, and the door

   This is the first thing a stranger sees of Good Loop, and until this round
   it did not exist: the empty hash was the app, so a visitor who had never
   heard of the product met a sign-in form. The app still owns that hash for
   anybody signed in — a returning person opens their library, not a sales
   page — and `PublicRoute` is where those two readings of one URL are
   settled.

   WHAT IS HERE AND WHAT IS NOT. The background is not: the photograph, the
   rings and the scrim are drawn once at the app root
   (`components/ambient/`), because they outlive every page change and a
   page cannot animate something it unmounts. This file draws the chrome and
   the words, and tells the background which stage it is on by claiming it.

   THE SWAP. Leaving a page takes 0.25s; the next one is told to wait 0.35s
   more before it fades in, so the content appears 0.6s after the click —
   which is roughly when the rings have finished travelling. The two are
   tuned against each other and are both in section 10 of the brief; change
   one and the page will look like it is racing its own background.
   ============================================================================ */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { BrandLogo } from '../components/Brand'
import { HASH_FOR_STAGE, navigate, R_COMO, R_EMPRESAS, R_LANDING, R_LOGIN, R_METODO, useStageClaim, type Stage } from '../components/ambient/stage'
import { Landing } from './Landing'
import { Como } from './Como'
import { Empresas } from './Empresas'
import { Metodo } from './Metodo'
import './public.css'

/** How long the outgoing page takes to clear. The incoming one's own delay
    is in `public.css`; together they make the 0.6s of the brief. */
const SWAP_MS = 250

/** The three pages in the bar, in order. Nothing else goes here — in
    particular not the legal page, which keeps its link in the door's foot
    where it has always been (CRS/LEG), and not a language picker. */
const NAV: { stage: Stage; hash: string; key: string }[] = [
  { stage: 'como', hash: R_COMO, key: 'How it works' },
  { stage: 'empresas', hash: R_EMPRESAS, key: 'For companies' },
  { stage: 'metodo', hash: R_METODO, key: 'The method' },
]

/* Never a reload: the background has to live through the change, or the
   rings cut instead of travelling. `navigate` is in `stage.ts`. */
const go = navigate

export function PublicSite({ stage, door }: { stage: Stage; door?: ReactNode }) {
  const { t } = useI18n()
  useStageClaim(stage)

  /* The page on screen lags the route by the length of its exit, so the two
     never overlap and the background has the window to itself in between. */
  const [shown, setShown] = useState<Stage>(stage)
  const [leaving, setLeaving] = useState(false)
  useEffect(() => {
    if (stage === shown) return
    setLeaving(true)
    const id = window.setTimeout(() => { setShown(stage); setLeaving(false) }, SWAP_MS)
    return () => window.clearTimeout(id)
  }, [stage, shown])

  const onDoor = stage === 'login'

  return (
    <div className={`pub${onDoor ? ' pub--door' : ''}`}>
      <PublicHeader stage={stage} onDoor={onDoor} />

      {/* `key` is what gives the incoming page its entrance: a new key is a
          new element, and the entrance is an animation rather than a
          transition, so it plays on mount and never again. */}
      <main className={leaving ? 'pub-main is-leaving' : 'pub-main'} key={shown}>
        {shown === 'landing' && <Landing />}
        {shown === 'como' && <Como />}
        {shown === 'empresas' && <Empresas />}
        {shown === 'metodo' && <Metodo />}
        {shown === 'login' && door}
      </main>

      <span className="pub-sr" aria-live="polite">{t(labelFor(stage))}</span>
    </div>
  )
}

/** What a screen reader is told the page changed to. The visual transition
    is a second long; without this, a keyboard user gets no announcement at
    all, because nothing about a hash change moves focus. */
function labelFor(stage: Stage): string {
  const hit = NAV.find((n) => n.stage === stage)
  if (hit) return hit.key
  if (stage === 'login') return 'Sign in'
  return 'goodloop — home'
}

/* ------------------------------------------------------------- the header --- */

function PublicHeader({ stage, onDoor }: { stage: Stage; onDoor: boolean }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const btnRef = useRef<HTMLButtonElement | null>(null)

  /* Escape closes it, and so does a tap anywhere that is not the sheet or
     the button that opened it. Both are wired only while it is open, so a
     closed menu costs no listeners. */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setOpen(false); btnRef.current?.focus() } }
    const onDown = (e: PointerEvent) => {
      const el = e.target as Node
      if (sheetRef.current?.contains(el) || btnRef.current?.contains(el)) return
      setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onDown)
    }
  }, [open])

  /* A page change closes it: on a phone the sheet covers what was just
     chosen. */
  useEffect(() => { setOpen(false) }, [stage])

  return (
    <header className="pub-head">
      <a
        className="pub-head__logo"
        href={window.location.pathname}
        aria-label={t('goodloop — home')}
        onClick={(e) => { e.preventDefault(); go(R_LANDING) }}
      >
        {/* The cream colourway: every public page stands on the dark
            ground, and the green mark on near-black is the one thing in
            `Brand.tsx` that is explicitly not allowed. */}
        <BrandLogo variant="cream" />
      </a>

      {/* The bar. Hidden on the door — there, only the logo stays, and it
          is the way back to the landing (10.2). */}
      <nav className="pub-head__nav" aria-label={t('The method')}>
        {NAV.map((n) => (
          <a
            key={n.hash}
            className={stage === n.stage ? 'pub-head__link is-on' : 'pub-head__link'}
            href={n.hash}
            aria-current={stage === n.stage ? 'page' : undefined}
            onClick={(e) => { e.preventDefault(); go(n.hash) }}
          >
            {t(n.key)}
          </a>
        ))}
      </nav>

      <a
        className="pub-head__in"
        href={R_LOGIN}
        onClick={(e) => { e.preventDefault(); go(R_LOGIN) }}
      >
        {t('Sign in')}
      </a>

      {/* The phone's way in to the same four links. Not rendered on the
          door, which has nothing to navigate to but back. */}
      {!onDoor && (
        <button
          ref={btnRef}
          type="button"
          className="pub-head__burger"
          aria-expanded={open}
          aria-label={open ? t('Close menu') : t('Open menu')}
          onClick={() => setOpen((o) => !o)}
        >
          <span aria-hidden="true" />
          <span aria-hidden="true" />
        </button>
      )}

      {open && (
        <div className="pub-sheet" ref={sheetRef}>
          {NAV.map((n) => (
            <a
              key={n.hash}
              className={stage === n.stage ? 'pub-sheet__link is-on' : 'pub-sheet__link'}
              href={n.hash}
              aria-current={stage === n.stage ? 'page' : undefined}
              onClick={(e) => { e.preventDefault(); setOpen(false); go(n.hash) }}
            >
              {t(n.key)}
            </a>
          ))}
          <a
            className="pub-sheet__link pub-sheet__link--in"
            href={R_LOGIN}
            onClick={(e) => { e.preventDefault(); setOpen(false); go(R_LOGIN) }}
          >
            {t('Sign in')}
          </a>
        </div>
      )}
    </header>
  )
}

export { HASH_FOR_STAGE, go as goPublic }
