/* ============================================================================
   The shell: the icon rail, and everything beside it

   Ported from the <nav> of HomeMood.dc.html — 64px wide, 52px circles, icon
   only, the label carried by `aria-label` rather than printed. The mark at
   the top is the official goodloop symbol (`components/Brand`), in the
   colourway the ground asks for: green on a light ground, cream on a dark
   one. Not redrawn here — the brand files are the only logo there is.

   Five destinations. "Minha jornada" was the sixth and is gone (POs,
   2026-11-06): its calendar is a pill in the top bar now
   (`ui2/MoodPill.tsx`), and the rest of it — the weekly check-in, the
   monthly report, the VAS chart — went with the screen, on their call.

   `.gl-root` is the scroller (shell.css, "scrolling"): the document stays
   locked as it always was, and a change of destination puts the column
   back at its top.
   ============================================================================ */

import { useRef, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { useStageClaim } from '../components/ambient/stage'
import { BrandIcon } from '../components/Brand'
import { useGround } from './groundChoice'

export type Dest = 'home' | 'therapy' | 'path' | 'loops' | 'profile'

/* The mockup's SVGs, copied. Every one is 24×24, 1.8 stroke, round caps. */
const ICONS: Record<Dest, ReactNode> = {
  home: (
    <>
      <path d="M3 11l9-7 9 7" />
      <path d="M5 10v10h14V10" />
    </>
  ),
  therapy: <path d="M4 5h16v11H9l-5 4zM12 13.6s-3-1.8-3-4a1.6 1.6 0 0 1 3-.8 1.6 1.6 0 0 1 3 .8c0 2.2-3 4-3 4z" />,
  path: (
    <>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <rect x="3" y="14" width="4" height="6" rx="1.5" />
      <rect x="17" y="14" width="4" height="6" rx="1.5" />
    </>
  ),
  /* A cup (POs, 2026-11-06). It was a heart with a plus in it for
     "Benefícios", then the two crossed ellipses of the Loops mark — which
     is a LOGO: at 22px in a rail it reads as the brand, not as a
     destination. Behind this door are achievements, challenges, rankings
     and prizes, and a cup is the one drawing nobody has to be taught. */
  loops: (
    <>
      <path d="M7 4h10v5a5 5 0 0 1-10 0z" />
      <path d="M7 6H4.5v1.5A3.5 3.5 0 0 0 8 11" />
      <path d="M17 6h2.5v1.5A3.5 3.5 0 0 1 16 11" />
      <path d="M12 14v3" />
      <path d="M8.5 20h7l-.7-3h-5.6z" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
}

/** English source strings; the dictionaries carry PT-BR and IT. */
const LABELS: Record<Dest, string> = {
  home: 'Home',
  therapy: 'Therapy',
  path: 'Guided care',
  loops: 'Loops',
  profile: 'Profile',
}

export const DESTS: Dest[] = ['home', 'therapy', 'path', 'loops', 'profile']

function Glyph({ dest }: { dest: Dest }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[dest]}
    </svg>
  )
}

/** The brand colourway this surface asks for. The mark is a PNG in two
    colourways, so no token can fix a cream one on sand — the markup has to
    know which file to ask for. This is the one place that does. */
export function useBrandVariant(): 'green' | 'cream' {
  return useGround() === 'light' ? 'green' : 'cream'
}

export function Shell({
  dest,
  onDest,
  dests = DESTS,
  surface = 'mood',
  children,
}: {
  dest: Dest
  onDest(next: Dest): void
  dests?: Dest[]
  /** 'mood' is the library's ground; 'deep' is the photograph the therapy,
      Loops and profile mockups stand on. */
  surface?: 'mood' | 'deep'
  children: ReactNode
}) {
  const { t } = useI18n()
  const variant = useBrandVariant()
  const root = useRef<HTMLDivElement>(null)

  /* THE SIGNED-IN APP STANDS ON THE RINGS (POs, 2026-11-06). The brand's
     mark, large, in the corner, over the person's own light or dark palette,
     with a fade at the foot so a card is read against a colour — drawn once
     at the app root by `components/ambient/`, which is also what dresses the
     landing page and the door.

     It began as the library's ground only, and the other four destinations
     kept the mountain photograph; one app on two different grounds, and
     changing tab changed the room. The claim moved here, to the shell every
     destination shares, so it is the ground of all five.

     The shell is also exactly the right place for the exception. A session —
     the detail page, the headphone check, the player — replaces the shell
     rather than rendering inside it, so this unmounts and the claim goes
     with it, which is what lets the protocol's own cover fill the window
     (`ui2/pageGround.ts`). Mounting is the whole condition; there is no
     list of screens to keep in step. */
  useStageClaim('home')

  return (
    <div ref={root} className={`gl-root${surface === 'deep' ? ' gl-root--deep' : ''}`}>
      <nav className="gl-nav" aria-label={t('Main navigation')}>
        {/* The mark is the way home. It looked like a link and was not one:
            a brand square at the head of a navigation rail is the one place
            everybody taps to get back, and this one did nothing. It goes to
            the Home and, if that is already where you are, back to the top
            of it — the same thing the rail's own buttons do. */}
        <button
          type="button"
          className="gl-nav__logo glass"
          aria-label={t('Home')}
          onClick={() => { root.current?.scrollTo({ top: 0 }); onDest('home') }}
        >
          <BrandIcon variant={variant} />
        </button>
        {dests.map((d) => (
          <button
            key={d}
            type="button"
            className={`gl-nav__btn glass-btn${d === dest ? ' is-on' : ''}`}
            aria-label={t(LABELS[d])}
            aria-current={d === dest ? 'page' : undefined}
            onClick={() => {
              /* A new screen, or the same one tapped again, starts at its
                 top — the column is the scroller, so the window does not
                 know about it. */
              root.current?.scrollTo({ top: 0 })
              onDest(d)
            }}
          >
            <Glyph dest={d} />
          </button>
        ))}
      </nav>

      <main className="gl-main">{children}</main>
    </div>
  )
}
