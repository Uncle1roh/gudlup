interface BreathingOrbProps {
  size?: number
  /** Animate the slow breath cycle (default true). */
  breathing?: boolean
  /** Show the emanating listening rings (default true). */
  rings?: boolean
}

/**
 * The Good Loop signature: a luminous breathing core wrapped in concentric
 * "listening rings" that ripple outward like sound. Reused at small size as the
 * brand mark, full size in the player's Phase 2, and as the post-session bloom.
 */
export function BreathingOrb({ size = 180, breathing = true, rings = true }: BreathingOrbProps) {
  const orbSize = Math.round(size * 0.62)
  return (
    <div className="orb-wrap" style={{ width: size, height: size }}>
      {rings && (
        <>
          <div className="ring" style={{ width: orbSize, height: orbSize }} />
          <div className="ring" style={{ width: orbSize, height: orbSize }} />
          <div className="ring" style={{ width: orbSize, height: orbSize }} />
        </>
      )}
      <div
        className={`orb${breathing ? ' orb--breathing' : ''}`}
        style={{ width: orbSize, height: orbSize }}
      />
    </div>
  )
}
