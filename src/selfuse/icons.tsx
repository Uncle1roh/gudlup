/* ============================================================================
   Self Use — the icon set

   The Studio redesign says it plainly: "Emoji are gone — real icons." The tab
   bar was 🏠 🧭 🎧 📈 🙂, which renders as five different art styles from five
   different vendors, at a size the platform picks, in colours nothing in the
   palette chose.

   The canvas draws Material Symbols Rounded. These are inline SVG on the same
   24px grid with the same round caps, rather than the webfont, for one reason:
   a webfont that has not arrived yet renders its ligature as literal text, so
   a slow network shows a person the words "graphic_eq" across the bottom of
   the screen. Inline paths cannot fail that way, cost no request, and inherit
   `currentColor` so the tab bar's own states drive them.

   Add icons here as screens need them. Keep them stroke-based at 1.8 and on
   the 24 grid, or they will not sit with the others.
   ============================================================================ */

export type IconName =
  | 'today'      // the session waiting for you — a waveform
  | 'library'
  | 'therapist'
  | 'progress'
  | 'profile'
  | 'play'
  | 'pause'
  | 'back10'
  | 'forward10'
  | 'close'
  | 'search'
  | 'help'
  | 'tune'
  | 'bell'
  | 'check'
  | 'headphones'
  | 'mic' | 'micOff'
  | 'camera' | 'cameraOff'
  | 'support'
  | 'clock'
  | 'spark'
  | 'record'
  /* the eight mood cards and the four post-session states — one drawn family
     instead of 😣 🌀 🪫 📋 ⬇️ ⏰ 🔌 💪 😌 😐 😖 🤝 */
  | 'tense' | 'racing' | 'exhausted' | 'overwhelmed'
  | 'unmotivated' | 'nervous' | 'disconnect' | 'stronger'
  | 'relaxed' | 'neutral' | 'restless'
  /* ON-4, the intake question — was 🎯 🌊 🔋 🔌 🌱 💭 */
  | 'target' | 'wave' | 'battery' | 'sprout' | 'thought'
  /* the five-point VAS face scale, before and after every session */
  | 'vas1' | 'vas2' | 'vas3' | 'vas4' | 'vas5'

const PATHS: Record<IconName, JSX.Element> = {
  /* graphic_eq — the app's own subject: sound. */
  today: (
    <>
      <path d="M4 10v4" /><path d="M8.5 6.5v11" /><path d="M13 3.5v17" />
      <path d="M17.5 7.5v9" /><path d="M21.5 10.5v3" />
    </>
  ),
  /* grid_view — a catalog you browse rather than a compass you point. */
  library: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
    </>
  ),
  /* headphones — the monitored session, the one with someone else in it. */
  therapist: (
    <>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <rect x="2.5" y="14" width="4.5" height="6.5" rx="2.25" />
      <rect x="17" y="14" width="4.5" height="6.5" rx="2.25" />
    </>
  ),
  /* monitoring — where you have got to, not a generic chart. */
  progress: (
    <>
      <path d="M3.5 20.5V4" /><path d="M3.5 20.5H21" />
      <path d="M7 16l4-4.5 3.5 3L20 7" />
      <circle cx="20" cy="7" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  profile: (
    <>
      <circle cx="12" cy="8" r="3.75" />
      <path d="M4.5 20a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  play: <path d="M8 5.2v13.6l11-6.8z" fill="currentColor" stroke="none" />,
  pause: (
    <>
      <rect x="7" y="5" width="3.6" height="14" rx="1.4" fill="currentColor" stroke="none" />
      <rect x="13.4" y="5" width="3.6" height="14" rx="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  back10: (
    <>
      <path d="M12 5.5a7 7 0 1 1-6.6 4.7" />
      <path d="M4.6 4.4v5.8h5.8" />
    </>
  ),
  forward10: (
    <>
      <path d="M12 5.5a7 7 0 1 0 6.6 4.7" />
      <path d="M19.4 4.4v5.8h-5.8" />
    </>
  ),
  close: <><path d="M6 6l12 12" /><path d="M18 6L6 18" /></>,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></>,
  /* a question mark drawn as strokes, so it inherits the set's weight
     instead of arriving as a glyph in whatever font happens to load */
  help: (
    <>
      <path d="M9 9a3 3 0 1 1 3.6 2.94c-.9.2-1.6 1-1.6 1.96V15" />
      <path d="M12 18.2v.1" />
    </>
  ),
  tune: (
    <>
      <path d="M4 7h10" /><path d="M18 7h2" /><circle cx="16" cy="7" r="2" />
      <path d="M4 17h6" /><path d="M14 17h6" /><circle cx="12" cy="17" r="2" />
    </>
  ),
  bell: (
    <>
      <path d="M6 10a6 6 0 0 1 12 0c0 4 1.4 5.5 1.4 5.5H4.6S6 14 6 10Z" />
      <path d="M10 19a2.2 2.2 0 0 0 4 0" />
    </>
  ),
  check: <path d="M5 12.6l4.4 4.4L19 7.4" />,
  headphones: (
    <>
      <path d="M4 15v-3a8 8 0 0 1 16 0v3" />
      <rect x="2.5" y="14" width="4.5" height="6.5" rx="2.25" />
      <rect x="17" y="14" width="4.5" height="6.5" rx="2.25" />
    </>
  ),
  mic: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" /><path d="M12 18v3" />
    </>
  ),
  micOff: (
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0" /><path d="M12 18v3" />
      <path d="M4 4l16 16" />
    </>
  ),
  camera: (
    <>
      <rect x="2.5" y="6" width="13" height="12" rx="3" />
      <path d="M15.5 11l6-3.2v8.4l-6-3.2z" />
    </>
  ),
  cameraOff: (
    <>
      <rect x="2.5" y="6" width="13" height="12" rx="3" />
      <path d="M15.5 11l6-3.2v8.4l-6-3.2z" />
      <path d="M4 4l16 16" />
    </>
  ),
  /* two hands meeting — the support route, not a hand-wave */
  support: (
    <>
      <path d="M3 13.5l3.5-3.5 3 3 2.5-2.5" />
      <path d="M21 13.5l-3.5-3.5-3 3" />
      <path d="M12 10.5l3 3-2 2-3-3" />
    </>
  ),
  clock: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7v5.4l3.4 2" /></>,
  spark: (
    <>
      <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z" />
      <path d="M18.5 16.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z" />
    </>
  ),
  record: <circle cx="12" cy="12" r="5.5" fill="currentColor" stroke="none" />,

  /* --- the mood family. Faces are three strokes, never a rendered emoji:
         one line for the brow, one for the mouth, two dots for eyes. --- */
  tense: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.6 9l1.8 1" /><path d="M15.4 9l-1.8 1" />
      <path d="M9 16c1.8-1.6 4.2-1.6 6 0" />
    </>
  ),
  racing: (
    <>
      <path d="M12 4.5a7.5 7.5 0 1 1-7.3 9.2" />
      <path d="M12 8.5a3.5 3.5 0 1 1-3.4 4.3" />
      <path d="M4.5 10.5L3 13.6l3.4.3" />
    </>
  ),
  exhausted: (
    <>
      <rect x="4" y="7" width="14" height="10" rx="2.6" />
      <path d="M20.5 10.5v3" />
      <path d="M6.5 12h3" />
    </>
  ),
  overwhelmed: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2.6" />
      <path d="M8.5 8.5h7" /><path d="M8.5 12h7" /><path d="M8.5 15.5h4" />
    </>
  ),
  unmotivated: <><path d="M12 4.5v13" /><path d="M6.6 12.5L12 18l5.4-5.5" /></>,
  nervous: (
    <>
      <circle cx="12" cy="13" r="7.5" /><path d="M12 9.5V13l2.6 1.6" />
      <path d="M4.6 4.8L7 3" /><path d="M19.4 4.8L17 3" />
    </>
  ),
  disconnect: (
    <>
      <path d="M9.5 3.5v4" /><path d="M14.5 3.5v4" />
      <path d="M7 7.5h10v3.2a5 5 0 0 1-10 0z" />
      <path d="M12 15.9v4.6" />
    </>
  ),
  stronger: (
    <>
      <path d="M4 12.5V10a2 2 0 0 1 4 0v.5" />
      <path d="M8 10.5V7.5a2 2 0 0 1 4 0v3" />
      <path d="M12 10.5V8.5a2 2 0 0 1 4 0V13" />
      <path d="M16 11a2 2 0 0 1 4 0v3a6.5 6.5 0 0 1-13 0v-2" />
    </>
  ),
  relaxed: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.3 10.6c.6-.7 1.6-.7 2.2 0" /><path d="M13.5 10.6c.6-.7 1.6-.7 2.2 0" />
      <path d="M8.8 14.4c1.8 1.7 4.6 1.7 6.4 0" />
    </>
  ),
  neutral: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="9.4" cy="10.4" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.6" cy="10.4" r="0.9" fill="currentColor" stroke="none" />
      <path d="M9 15h6" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.6" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </>
  ),
  wave: (
    <>
      <path d="M2.5 9.5c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
      <path d="M2.5 14.5c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
      <path d="M2.5 19c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
    </>
  ),
  battery: (
    <>
      <rect x="3" y="7" width="15" height="10" rx="2.6" />
      <path d="M20.5 10.5v3" /><path d="M6.5 10.5v3" />
    </>
  ),
  sprout: (
    <>
      <path d="M12 20.5v-7" />
      <path d="M12 13.5C12 10 9.5 8 6.5 8c0 3.5 2.5 5.5 5.5 5.5Z" />
      <path d="M12 13.5C12 10.6 14.2 9 16.8 9c0 2.9-2.2 4.5-4.8 4.5Z" />
    </>
  ),
  thought: (
    <>
      <path d="M7.5 15.5A4.5 4.5 0 0 1 8 6.6a4.6 4.6 0 0 1 8.6.9 4 4 0 0 1-.6 8H7.5Z" />
      <circle cx="6" cy="19" r="1.5" /><circle cx="10" cy="20.6" r="1" />
    </>
  ),
  /* One face per step, differing only in the mouth (and a brow at the ends),
     so the scale reads as one instrument rather than five pictures. */
  vas1: (<>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M7.8 7.8l2.4 1" /><path d="M16.2 7.8l-2.4 1" />
      <circle cx="9.4" cy="10.2" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.6" cy="10.2" r="0.9" fill="currentColor" stroke="none" />
      <path d="M8.6 16.6c1.9-2.2 4.9-2.2 6.8 0" />
    </>),
  vas2: (<>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="9.4" cy="10.2" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.6" cy="10.2" r="0.9" fill="currentColor" stroke="none" />
      <path d="M9 15.9c1.7-1.4 4.3-1.4 6 0" />
    </>),
  vas3: (<>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="9.4" cy="10.2" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.6" cy="10.2" r="0.9" fill="currentColor" stroke="none" />
      <path d="M9 15.2h6" />
    </>),
  vas4: (<>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="9.4" cy="10.2" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.6" cy="10.2" r="0.9" fill="currentColor" stroke="none" />
      <path d="M9 14.4c1.7 1.4 4.3 1.4 6 0" />
    </>),
  vas5: (<>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M7.8 8.6l2.4-1" /><path d="M16.2 8.6l-2.4-1" />
      <circle cx="9.4" cy="10.2" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14.6" cy="10.2" r="0.9" fill="currentColor" stroke="none" />
      <path d="M8.6 13.8c1.9 2.4 4.9 2.4 6.8 0" />
    </>),
  restless: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.4 9.4l2 1.2" /><path d="M15.6 9.4l-2 1.2" />
      <path d="M8.8 16.2c.9-1.2 2-1.2 3-.3s2.1.9 3-.3" />
    </>
  ),
}

/**
 * One icon, sized in px and coloured by whatever `color` the parent sets.
 * `title` makes it announceable; without one it is decorative and hidden,
 * which is right whenever a visible label sits beside it (as in the tab bar).
 */
export function Icon({
  name,
  size = 23,
  title,
  className,
}: {
  name: IconName
  size?: number
  title?: string
  className?: string
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
