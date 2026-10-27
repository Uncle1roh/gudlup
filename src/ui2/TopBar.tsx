/* ============================================================================
   The top bar the deep screens share

   From the <header> of WTerapia.dc.html: the wordmark with today's date
   under it on the left, the Loops pill, the avatar and the person's name
   with their role on the right.

   The library has its own header — the greeting and the mood chip — so this
   one is for the screens that stand on the photograph.
   ============================================================================ */

import { useEffect, useState } from 'react'
import { useI18n } from '../i18n'
import { useDataProvider } from '../data/provider'
import { initialsOf } from './Home'

export function TopBar({ name, role }: { name: string | null; role?: string }) {
  const { t, d } = useI18n()
  const dp = useDataProvider()
  const [loops, setLoops] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    void dp.getWallet()
      .then((w) => { if (alive) setLoops(w.loops) })
      .catch(() => { if (alive) setLoops(null) })
    return () => { alive = false }
  }, [dp])

  return (
    <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span className="gl-wordmark">goodloop</span>
        <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
          {d(Date.now(), { weekday: 'long', day: 'numeric', month: 'long' })}
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {loops !== null && (
          <span className="glass-btn" style={{ height: 44, padding: '0 16px', borderRadius: 999, display: 'flex', alignItems: 'center', fontSize: 14, fontWeight: 600 }}>
            {t('{n} Loops', { n: loops.toLocaleString() })}
          </span>
        )}
        <span
          aria-hidden="true"
          style={{ width: 44, height: 44, borderRadius: '50%', background: '#E89D64', color: '#2a1608', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}
        >
          {initialsOf(name)}
        </span>
        {name && (
          <span style={{ display: 'flex', flexDirection: 'column', fontSize: 14, lineHeight: 1.25 }}>
            <strong style={{ fontWeight: 600 }}>{name}</strong>
            {role && <span style={{ color: 'var(--ink-2)', fontSize: 12 }}>{role}</span>}
          </span>
        )}
      </div>
    </header>
  )
}

/** The screen title and its one line under it, as the deep mockups set it. */
export function PageTitle({ title, note }: { title: string; note?: string }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '28px 8px 0' }}>
      <h1 style={{ margin: 0, fontFamily: 'Outfit, sans-serif', fontWeight: 400, fontSize: 48, lineHeight: 1.05, letterSpacing: '-0.02em' }}>
        {title}
      </h1>
      {note && <p style={{ margin: 0, fontSize: 16, color: 'var(--ink-2)' }}>{note}</p>}
    </section>
  )
}
