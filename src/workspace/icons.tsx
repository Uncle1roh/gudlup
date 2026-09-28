/* Inline icons for the workspace. An emoji is drawn by whatever colour-emoji
   font the machine has, and on a clinic desktop without one the call button
   in the Upcoming list rendered as an empty box. A stroke SVG in
   `currentColor` renders the same everywhere and follows the button's colour. */

export function VideoIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      className="w-icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2.5" y="6" width="13" height="12" rx="2.5" />
      <path d="M15.5 10.5 21 7.5v9l-5.5-3" />
    </svg>
  )
}
