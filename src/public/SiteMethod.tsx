/* ============================================================================
   Metodologia — the eight layers on the waterfall, then the whole argument

   v19's `#page-methodology`: the longest page on the site, and the only one
   with two halves. The first is the waterfall — a cascade made of many
   separate threads of water that you hear as one sound, with eight labels
   sitting on eight of those threads — and the five numbers under it. The
   second is the POs' long body: nine tools, six phases, three lengths, the
   evidence table, why it works, and a band at the foot.

   NOTHING PLAYS HERE. v19 dropped the "hear the layers" button the earlier
   method page had, and so does this: there is no cleared public extract
   (`config/publicSite.ts`), and a button that promises sound and gives none
   is the worst thing a page like this could carry.

   THE FIVE NUMBERS are written down rather than counted from the live
   catalogue, on purpose: a public page that recomputed them would read
   "0 tecniche" on a bad deployment, and they are a claim about the METHOD,
   not a count of today's rows.

   THE LINE UNDER THE EVIDENCE TABLE (`evFine`) says that the audio is
   inspired by principles found in that research and is not EMDR, DBT or any
   other named clinical modality. The table names those fields, so the page
   cannot carry one without the other. CLAUDE.md.
   ============================================================================ */

import { R_LOGIN, R_MODULOS, navigate } from '../components/ambient/stage'
/* The long body's own strings carry the same `<b>goodloop</b>` the rest
   of the site does, so they go through the same reader. */
import { rich as r2, useSite } from './lang'
import type { CopyKey } from './copy'
import { METHOD_BODY } from './methodCopy'

/** The eight layers and where each one sits on the picture, as percentages
    of the frame. The last two are out on the right-hand fall and are the
    ones a phone has no room for. */
const LAYERS: { key: CopyKey; left: number; top: number }[] = [
  { key: 'ly1', left: 7.5, top: 30 },
  { key: 'ly2', left: 12.5, top: 12 },
  { key: 'ly3', left: 18.4, top: 42 },
  { key: 'ly4', left: 25.6, top: 20 },
  { key: 'ly5', left: 33.8, top: 36 },
  { key: 'ly6', left: 42.5, top: 8 },
  { key: 'ly7', left: 49.7, top: 25 },
  { key: 'ly8', left: 88.1, top: 18 },
]

const STATS: { v: CopyKey; l: CopyKey }[] = [
  { v: 's1v', l: 's1l' },
  { v: 's2v', l: 's2l' },
  { v: 's3v', l: 's3l' },
  { v: 's4v', l: 's4l' },
  { v: 's5v', l: 's5l' },
]

/** The nine tools' drawings, in the POs' order. Language-independent, which
    is why they are here and the words are in `methodCopy.ts`. */
const TOOL_ICONS = [
  <>
    <path d="M4 13a8 8 0 0116 0" />
    <rect x="2" y="13" width="5" height="7" rx="1.5" />
    <rect x="17" y="13" width="5" height="7" rx="1.5" />
  </>,
  <>
    <path d="M9 3H4v5" />
    <path d="M4 3l6 6" />
    <circle cx="14" cy="14" r="7" />
  </>,
  <path d="M3 12h3l2-7 4 14 2-9 2 5h5" />,
  <>
    <path d="M12 3a3 3 0 013 3v5a3 3 0 01-6 0V6a3 3 0 013-3z" />
    <path d="M6 11a6 6 0 0012 0" />
    <path d="M12 17v4" />
  </>,
  <>
    <path d="M9 18V6l10-2v12" />
    <circle cx="6.5" cy="18" r="2.5" />
    <circle cx="16.5" cy="16" r="2.5" />
  </>,
  <>
    <circle cx="8" cy="9" r="2.4" />
    <circle cx="16" cy="15" r="2.4" />
    <path d="M10 10l4 4" />
  </>,
  <path d="M4 12a8 8 0 1114 5.3M4 12l3-3M4 12l3 3" />,
  <path d="M12 4c3 3 4 5 4 8a4 4 0 01-8 0c0-3 1-5 4-8z" />,
  <>
    <path d="M7 11V7a5 5 0 0110 0v4" />
    <path d="M5 11h14l-1 9H6l-1-9z" />
  </>,
]

export function SiteMethod() {
  const { s, r, lang } = useSite()
  const m = METHOD_BODY[lang]

  return (
    <>
      <div className="glw-orb glw-orb-a" />
      <div className="glw-orb glw-orb-b" />

      {/* ---- the waterfall ------------------------------------------- */}
      <section className="glw-section glw-tight glw-mi">
        <div className="glw-wrap">
          <h1 className="glw-h1">{r('t_h1')}</h1>
          <p className="glw-sub">{s('t_sub')}</p>

          <div className="pub-frame" role="img" aria-label={s('t_frame')}>
            <div className="pub-frame__veil" aria-hidden="true" />
            {LAYERS.map((l, i) => (
              <span
                key={l.key}
                className={i >= 6 ? 'pub-layer pub-layer--far' : 'pub-layer'}
                style={{ left: `${l.left}%`, top: `${l.top}%` }}
              >
                {s(l.key)}
              </span>
            ))}
          </div>

          <div className="glw-stats glw-five">
            {STATS.map((st) => (
              <div className="glw-stat" key={st.v}>
                <span className="glw-num">{s(st.v)}</span>
                <span className="glw-lbl">{s(st.l)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The long body sits one level down, exactly as it does in v19,
          where it is wrapped in `<div class="mlang m-it">`. That wrapper is
          not decoration: `.page > section.section.tight` gives a page's
          FIRST section its 128px of room under the fixed bar, and the
          sections below it are not supposed to have it. Flatten this and
          the page grows a 72px hole under the waterfall. */}
      <div className="glw-mbody">
      {/* ---- the opening claim --------------------------------------- */}
      <section className="glw-section glw-tight">
        <div className="glw-wrap">
          <span className="glw-eyebrow">{m.intro.eyebrow}</span>
          <h2 className="glw-h1">{m.intro.h2}</h2>
          <p className="glw-sub">{r2(m.intro.sub)}</p>
          <div className="glw-panel" style={{ marginTop: 34, maxWidth: 760 }}>
            <p style={{ fontSize: '0.98rem', color: 'var(--ink)' }}>
              <strong style={{ color: 'var(--cream)' }}>{m.intro.panelLead}</strong>{' '}
              {m.intro.panelRest}
            </p>
          </div>
        </div>
      </section>

      {/* ---- the nine tools ------------------------------------------ */}
      <section className="glw-section">
        <div className="glw-wrap">
          <div className="glw-section-head">
            <span className="glw-eyebrow">{m.toolsEyebrow}</span>
            <h2>{m.toolsH2}</h2>
          </div>
          <div className="glw-grid-3" style={{ marginTop: 44 }}>
            {m.tools.map((tool, i) => (
              <div className="glw-card" key={tool.h}>
                <svg className="glw-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                  {TOOL_ICONS[i]}
                </svg>
                <h3>{tool.h}</h3>
                <p>{tool.t}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- the six phases ------------------------------------------ */}
      <section className="glw-section glw-band-raised">
        <div className="glw-wrap">
          <span className="glw-eyebrow">{m.stepsEyebrow}</span>
          <h2 className="glw-section-head">{m.stepsH2}</h2>
          <div className="glw-stepper">
            {m.steps.map((st) => (
              <div className="glw-step" key={st.no}>
                <div className="glw-no">{st.no}</div>
                <h3>{st.h}</h3>
                <p className="glw-q">{st.q}</p>
                <p>{st.t}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- the three lengths --------------------------------------- */}
      <section className="glw-section">
        <div className="glw-wrap">
          <div className="glw-section-head">
            <span className="glw-eyebrow">{m.lensEyebrow}</span>
            <h2>{m.lensH2}</h2>
          </div>
          <div className="glw-len-grid">
            {m.lens.map((l) => (
              <div className="glw-len-card" key={l.mn}>
                <span className="glw-tt">{l.tt}</span>
                <span className="glw-mn">{l.mn}</span>
                <p>{l.t}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- the evidence -------------------------------------------- */}
      <section className="glw-section">
        <div className="glw-wrap glw-m-two glw-a">
          <div>
            <span className="glw-eyebrow">{m.evEyebrow}</span>
            <h2>{m.evH2}</h2>
            <div className="glw-panel" style={{ marginTop: 22, padding: '22px 24px' }}>
              <p style={{ fontSize: '0.95rem' }}>
                <strong style={{ color: 'var(--accent)' }}>{m.evLead}</strong>{' '}
                {m.evRest}
              </p>
              {/* Inspired by, not equivalent to. */}
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)', marginTop: 14 }}>{r2(m.evFine)}</p>
            </div>
          </div>
          <div className="glw-table-wrap">
            <table className="glw-evidence">
              <thead>
                <tr><th>{m.thField}</th><th>{m.thSays}</th></tr>
              </thead>
              <tbody>
                {m.rows.map((row) => (
                  <tr key={row.field}><td>{row.field}</td><td>{row.says}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ---- why it works -------------------------------------------- */}
      <section className="glw-section glw-band-raised">
        <div className="glw-wrap glw-m-two glw-b">
          <div>
            <span className="glw-eyebrow">{m.whyEyebrow}</span>
            <h2>{m.whyH2}</h2>
          </div>
          <div>
            <ul className="glw-why-list">
              {m.why.map((w) => (
                <li key={w.lead}><strong>{w.lead}</strong>{w.rest}</li>
              ))}
            </ul>
            <p className="glw-m-big">{m.big}</p>
          </div>
        </div>
      </section>

      {/* ---- the band at the foot ------------------------------------ */}
      <section className="glw-cta-band">
        <div className="glw-wrap">
          <div className="glw-panel glw-cta-cream">
            <h2>{m.ctaH2}</h2>
            <div className="glw-cta-actions">
              <a
                className="glw-btn glw-btn-outline-dark"
                href={R_MODULOS}
                onClick={(e) => { e.preventDefault(); navigate(R_MODULOS) }}
              >
                {m.ctaModules}
              </a>
              <a
                className="glw-btn glw-btn-ink"
                href={R_LOGIN}
                onClick={(e) => { e.preventDefault(); navigate(R_LOGIN) }}
              >
                {m.ctaEnter}
              </a>
            </div>
          </div>
        </div>
      </section>
      </div>
    </>
  )
}
