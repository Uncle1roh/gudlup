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
import { useMoodSet } from '../mood/MoodProvider'

export type Dest = 'home' | 'therapy' | 'path' | 'journey' | 'benefits' | 'profile'

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
  benefits: (
    <>
      <path d="M12 20s-7-4.5-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.5-7 10-7 10z" />
      <path d="M12 9.5v5M9.5 12h5" />
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
  path: 'My path',
  journey: 'My journey',
  benefits: 'Benefits',
  profile: 'Profile',
}

export const DESTS: Dest[] = ['home', 'therapy', 'path', 'journey', 'benefits', 'profile']

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

/** The brand colourway for whatever ground the mood has set. */
export function useBrandVariant(): 'green' | 'cream' {
  return useMoodSet() === 'dark' ? 'cream' : 'green'
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
      journey, benefits and profile mockups stand on. */
  surface?: 'mood' | 'deep'
  children: ReactNode
}) {
  const { t } = useI18n()
  const variant = useBrandVariant()
  const root = useRef<HTMLDivElement>(null)

  return (
    <div ref={root} className={`gl-root${surface === 'deep' ? ' gl-root--deep' : ''}`}>
      <nav className="gl-nav" aria-label={t('Main navigation')}>
        <span className="gl-nav__logo glass" aria-hidden="true">
          <BrandIcon variant={variant} />
        </span>
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
