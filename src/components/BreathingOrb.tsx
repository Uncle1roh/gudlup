interface BreathingOrbProps {
  size?: number
  /** Animate the slow breath cycle (default true). */
  breathing?: boolean
  /** Show the emanating listening rings (default true). */
  rings?: boolean
}

/**
 * When each listening ring starts, evenly across the 10s ripple cycle.
 *
 * These belong to the elements, not to the stylesheet. They used to be
 * `.ring:nth-child(2|3|4)` rules, while this wrapper's children are
 * ring, ring, ring, orb — so the first two rings both started at 0s, the third
 * started at 3.3s, and the last rule pointed at the ORB, which is not a ring
 * and matched nothing. You saw one double-strength ripple, then one more, then
 * a third of the cycle with nothing leaving the orb at all. Set here, the
 * stagger cannot drift out of step with the markup again.
 */
const RIPPLE_DELAYS = ['0s', '3.33s', '6.67s']

/**
 * The Good Loop signature: a luminous breathing core wrapped in concentric
 * "listening rings" that ripple outward like sound. Reused at small size as the
 * brand mark, full size in the player's Phase 2, and as the post-session bloom.
 */
export function BreathingOrb({ size = 180, breathing = true, rings = true }: BreathingOrbProps) {
  const orbSize = Math.round(size * 0.62)
  return (
    <div className="orb-wrap" style={{ width: size, height: size }}>
      {rings && RIPPLE_DELAYS.map((delay) => (
        <div
          key={delay}
          className="ring"
          style={{ width: orbSize, height: orbSize, animationDelay: delay }}
        />
      ))}
      <div
        className={`orb${breathing ? ' orb--breathing' : ''}`}
        style={{ width: orbSize, height: orbSize }}
      />
    </div>
  )
}
