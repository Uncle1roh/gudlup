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
  | 'tune'

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
  tune: (
    <>
      <path d="M4 7h10" /><path d="M18 7h2" /><circle cx="16" cy="7" r="2" />
      <path d="M4 17h6" /><path d="M14 17h6" /><circle cx="12" cy="17" r="2" />
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
