/* ============================================================================
   One background, mounted once, for seven places

   WHAT IT IS. Five fixed layers behind everything: a flat base colour, the
   brand's rings filled and stacked, the waterfall photograph with a scrim,
   ten thin rings drawn around the person in it, and — on the library only —
   a fade at the foot of the window so cards stay legible over the picture.

   WHY IT IS MOUNTED AT THE ROOT. The rings travel. Clicking a nav item
   slides them across the window over a second; signing in sends them from
   the person in the photograph out to the corner of the library and scales
   them up twenty-five times on the way. A CSS transition only happens if
   the element lives through the change — so this cannot be rendered by a
   page, because leaving the page would unmount it and the travel would be a
   cut. It sits outside everything that routes and is told which `stage` to
   be on; `stage.ts` explains how that answer is assembled from two ends of
   the tree.

   WHAT IT NEVER DOES. It is `pointer-events: none` throughout and
   `aria-hidden`: it is scenery, nothing in it is a control, and a screen
   reader should not meet a single node of it. On every route that is not
   one of the seven it is `off` — transparent, so the surface under it keeps
   exactly the background it had.
   ============================================================================ */

import { useEffect, useRef, useState } from 'react'
import { FilledRings, OutlineRings, type Palette } from './rings'
import {
  HERO_BASE_WIDTH,
  HERO_FOCUS,
  coverPoint,
  heroPos,
  type CoverPoint,
} from './focal'
import { clearArrival, useArrived, useStage, type Stage } from './stage'
import { backgrounds, subscribeBackgrounds, type BackgroundSet } from '../../app/backgrounds'
import { useGround } from '../../ui2/groundChoice'
import './ambient.css'

/**
 * The landing's picture, for the one screen that prints it as a FRAME
 * rather than as a background (`public/Metodo.tsx`).
 *
 * It is a function and not a constant now: the picture is a setting, and a
 * page that quoted the old constant would have shown last month's photograph
 * beside this month's one.
 */
export function heroSrc(): string {
  return backgrounds().landing
}

/** Where the rings sit, as fractions of the window, per stage. The landing
    and the door are not here: on those two they are centred on the person,
    which is not a fraction of anything. */
const CENTRE: Partial<Record<Stage, { x: number; y: number }>> = {
  como: { x: 0.1042, y: 0.600 },
  empresas: { x: 0.9444, y: 0.8444 },
  metodo: { x: 0.9653, y: 0.4778 },
  home: { x: 0.7083, y: 0.2622 },
}

const SCALE: Partial<Record<Stage, number>> = {
  landing: 0.04,
  login: 0.04,
  como: 0.50,
  empresas: 0.55,
  metodo: 0.50,
  home: 1.00,
}

/** The whole of the login-to-library animation, after which an arrival is
    an ordinary visit again (the longest leg is the rings: 0.35s + 2.0s). */
const ARRIVAL_MS = 2600

/** `.amb--off`'s opacity transition, in `ambient.css`. */
const OFF_FADE_MS = 320

interface Geometry {
  cx: number
  cy: number
  k: number
}

/** The setting, as React state: it arrives from the network a moment after
    the first paint, and every layer below depends on it. */
function useBackgrounds(): BackgroundSet {
  const [bg, setBg] = useState<BackgroundSet>(() => backgrounds())
  useEffect(() => subscribeBackgrounds(() => setBg(backgrounds())), [])
  return bg
}

export function AmbientBackground() {
  /* Not a prop: the stage is claimed by whichever screen is on, because the
     route alone cannot tell the landing from the library. See `stage.ts`. */
  const stage: Stage = useStage()
  const ground = useGround()
  const arrived = useArrived()
  const bg = useBackgrounds()

  /* One picture per surface. The public pages and the door share the
     landing's; everything signed in shares the app's. */
  const onHeroStage = stage === 'landing' || stage === 'login' || stage === 'como' || stage === 'empresas' || stage === 'metodo'
  const photoSrc = stage === 'home' ? bg.app : bg.landing
  const wantRings = stage === 'home' ? bg.appRings : bg.landingRings

  /* The window, and the photograph's own size. The second is read off the
     loaded <img> rather than written down here, so the POs can drop in a
     larger export of the same framing and nothing needs editing. */
  const [vp, setVp] = useState(() => ({
    w: typeof window === 'undefined' ? HERO_BASE_WIDTH : window.innerWidth,
    h: typeof window === 'undefined' ? 900 : window.innerHeight,
  }))
  const [img, setImg] = useState<{ w: number; h: number } | null>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)

  /* A direct load must open ON the target stage, not travel to it: without
     this, opening the library painted the rings at the landing's position
     and scale for a frame and then slid them into place, which looked like
     a bug on every reload. Two frames, because one is not always enough for
     the browser to have committed the first styles it was given. */
  const [noAnim, setNoAnim] = useState(true)
  useEffect(() => {
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setNoAnim(false))
    })
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2) }
  }, [])

  useEffect(() => {
    let raf = 0
    const onResize = () => {
      /* Throttled to a frame: a desktop drag fires resize dozens of times a
         second and every one of them would move eleven filtered circles. */
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        setVp({ w: window.innerWidth, h: window.innerHeight })
      })
    }
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  /* The image may already be complete when this mounts — it is preloaded in
     the document head — in which case `onLoad` never fires. */
  useEffect(() => {
    const el = imgRef.current
    if (el && el.complete && el.naturalWidth) {
      setImg({ w: el.naturalWidth, h: el.naturalHeight })
    }
  }, [])

  const pos = heroPos(vp.w)
  const anchor: CoverPoint | null = img
    ? coverPoint(vp.w, vp.h, img.w, img.h, pos.x, pos.y, HERO_FOCUS.fx, HERO_FOCUS.fy)
    : null

  /* `off` keeps the geometry it had rather than computing a new one, which
     is what makes leaving the library and coming back a fade instead of a
     journey (10.4). */
  const lastGeom = useRef<Geometry>({ cx: vp.w / 2, cy: vp.h / 2, k: SCALE.home ?? 1 })
  let geom: Geometry = lastGeom.current
  if (stage !== 'off') {
    const frac = CENTRE[stage]
    const centre = frac
      ? { x: frac.x * vp.w, y: frac.y * vp.h }
      : anchor
        ? { x: anchor.x, y: anchor.y }
        /* The photograph has not reported its size yet. On the two stages
           that need it the rings are at 0.04 and invisible under the
           picture anyway, so the middle of the window is a safe stand-in
           for the frame it takes. */
        : { x: vp.w / 2, y: vp.h / 2 }
    geom = { cx: centre.x, cy: centre.y, k: SCALE[stage] ?? 1 }
    lastGeom.current = geom
  }

  const palette: Palette = stage === 'home' ? ground : 'dark'

  /* Both palettes are in the document only once the second one has been
     asked for, so the preference can cross-fade (5.1) without every public
     page paying for a set of circles it will never show. */
  const [seen, setSeen] = useState<Palette[]>([palette])
  useEffect(() => {
    setSeen((s) => (s.includes(palette) ? s : [...s, palette]))
  }, [palette])

  /* The long arrival. Held in state rather than read straight from the
     store so the class is stable for the whole animation, and cleared
     afterwards so the next visit to the library is an ordinary one. */
  const arriving = stage === 'home' && arrived
  useEffect(() => {
    if (!arrived) return
    /* On the library this is the animation's own length. Anywhere else the
       sign-in went somewhere that has no arrival to play — a clinician, an
       HR account — and the flag is simply swept up, generously late, so it
       cannot still be lying there the next time somebody opens the app in
       this tab. */
    const id = window.setTimeout(() => clearArrival(), arriving ? ARRIVAL_MS : ARRIVAL_MS * 3)
    return () => window.clearTimeout(id)
  }, [arrived, arriving])

  /* Tell the app's own stylesheet to stand down while this is on screen.
     See the block in `ui2/shell.css` keyed on `data-gl-amb` for why an
     opaque layer at `z-index: -1` is not enough on its own. Removed on the
     way out, and on unmount, so nothing can be left holding it. */
  const owning = stage !== 'off'
  useEffect(() => {
    const root = document.documentElement
    if (owning) {
      /* The STAGE, not just "on": `shell.css` wants to know that the app's
         own ground must step aside, and `index.css` wants to know the
         narrower thing — that the ground in question is the door's
         photograph, which the first-run screens stand on too. */
      root.dataset.glAmb = stage
      return
    }
    /* Held through the fade. `.amb--off` takes 0.3s to reach zero, and the
       app's own ground is opaque and in front — put it back on the frame
       the stage changed and the fade happens behind it, invisibly. */
    const id = window.setTimeout(() => { delete root.dataset.glAmb }, OFF_FADE_MS)
    return () => window.clearTimeout(id)
    /* `stage`, not just `owning`. The attribute carries the stage's NAME,
       and `index.css` keys the first-run rules on `login` specifically — so
       an effect that only re-ran when ownership changed left `login` on the
       document all the way into the library, where those rules would then
       strip the ground from any screen that happened to use the same
       classes. Caught in a browser: the library reported
       `data-gl-amb="landing"`. */
  }, [owning, stage])

  const diameter = 3000 * Math.max(vp.w / HERO_BASE_WIDTH, vp.h / 900)
  const k = anchor ? anchor.displayedWidth / HERO_BASE_WIDTH : 1
  /* THE PICTURE IS SHOWN ON EVERY STAGE NOW. It used to appear on the
     landing and the door only, because the three public pages were drawn
     over the rings; with a photograph on both surfaces there is nothing for
     those pages to stand on otherwise, and sliding the rings between them
     was the point of hiding it. */
  const onHero = stage !== 'off'

  const cls = [
    'amb',
    `amb--${stage}`,
    noAnim ? 'no-anim' : '',
    arriving ? 'is-arriving' : '',
    `amb--pal-${palette}`,
  ].filter(Boolean).join(' ')

  return (
    <div className={cls} aria-hidden="true">
      {/* 1 — the ground under everything */}
      <div className="amb-base" />

      {/* 2 — the rings, when the setting asks for them. Both pictures that
          ship carry their own concentric structure, so they are off by
          default and switched back on from the commercial console
          (`app/backgrounds.ts`) rather than by a deploy.

          Two wrappers, because position and scale are given different
          durations and a single transform can only have one. */}
      {wantRings && (
      <div
        className="amb-rings"
        style={{
          width: diameter,
          height: diameter,
          transform: `translate3d(${geom.cx - diameter / 2}px, ${geom.cy - diameter / 2}px, 0)`,
        }}
      >
        <div className="amb-rings__scale" style={{ transform: `scale(${geom.k})` }}>
          {seen.map((p) => (
            <div key={p} className={p === palette ? 'amb-rings__pal is-on' : 'amb-rings__pal'}>
              <FilledRings palette={p} />
            </div>
          ))}
        </div>
      </div>
      )}

      {/* 3 — the photograph, and the scrim that makes cream type legible on
          it. Always in the DOM: it is the heaviest thing either public page
          loads, and unmounting it on every nav would make going back to the
          landing a second download. */}
      <div className={onHero ? 'amb-photo is-on' : 'amb-photo'}>
        <img
          ref={imgRef}
          className="amb-photo__img"
          /* `key` so a change of picture really remounts the element: React
             would otherwise keep the old `<img>` and its old natural size
             until the new file happened to decode, and the focal maths
             would be running against the wrong dimensions in between. */
          key={photoSrc}
          src={photoSrc}
          alt=""
          aria-hidden="true"
          decoding="async"
          /* The landing keeps the crop its photograph was framed for; the
             app's is centred, because that picture is portrait and any
             offset tuned for a landscape one throws its subject off the
             edge. Both are `cover`, so nothing is ever letterboxed. */
          style={{ objectPosition: stage === 'home' ? '50% 50%' : `${pos.x * 100}% ${pos.y * 100}%` }}
          onLoad={(e) => {
            const el = e.currentTarget
            setImg({ w: el.naturalWidth, h: el.naturalHeight })
          }}
        />
        <div className="amb-photo__scrim" />
      </div>

      {/* 4 — the rings on the person. Only drawn once the picture has said
          how big it is, because without that there is no person to be on. */}
      {wantRings && anchor && onHeroStage && (
        <div className={onHero ? 'amb-outline is-on' : 'amb-outline'}>
          <OutlineRings x={anchor.x} y={anchor.y} k={k} breathing={stage === 'login'} />
        </div>
      )}

      {/* 5 — the library's own fade, so a card at the foot of the window is
          read against a colour rather than against the rings. */}
      <div className="amb-fade" />
    </div>
  )
}
