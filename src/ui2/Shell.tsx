/* ============================================================================
   The shell: the icon rail, and everything beside it

   Ported from the <nav> of HomeMood.dc.html — 64px wide, 52px circles, icon
   only, the label carried by `aria-label` rather than printed. The mark at
   the top is the official goodloop symbol (`components/Brand`), in the
   colourway the ground asks for: green on a light ground, cream on a dark
   one. Not redrawn here — the brand files are the only logo there is.

   Six destinations. "Percurso" is the new one: the protocols a therapist
   parameterised for this person, which used to be buried inside Terapia.

   `.gl-root` is the scroller (shell.css, "scrolling"): the document stays
   locked as it always was, and a change of destination puts the column
   back at its top.
   ============================================================================ */

import { useRef, type ReactNode } from 'react'
import { useI18n } from '../i18n'
import { BrandIcon } from '../components/Brand'
import { useGround } from './groundChoice'

export type Dest = 'home' | 'therapy' | 'path' | 'journey' | 'loops' | 'profile'

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
  journey: (
    <>
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="5" r="2" />
      <path d="M8 19h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7" />
    </>
  ),
  /* The two crossed ellipses the app draws everywhere a Loop is named
     (`selfuse/icons.tsx`, 'loop'). It was a heart with a plus in it, for a
     destination called "Benefícios" — a heart on a rail beside a therapy
     tab reads as care, not as what a minute of listening earns. */
  loops: (
    <>
      <ellipse cx="12" cy="12" rx="8.5" ry="4.2" transform="rotate(-30 12 12)" />
      <ellipse cx="12" cy="12" rx="8.5" ry="4.2" transform="rotate(30 12 12)" />
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
  journey: 'My journey',
  loops: 'Loops',
  profile: 'Profile',
}

export const DESTS: Dest[] = ['home', 'therapy', 'path', 'journey', 'loops', 'profile']

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
      journey, Loops and profile mockups stand on. */
  surface?: 'mood' | 'deep'
  children: ReactNode
}) {
  const { t } = useI18n()
  const variant = useBrandVariant()
  const root = useRef<HTMLDivElement>(null)

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
