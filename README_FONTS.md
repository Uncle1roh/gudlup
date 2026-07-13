# Brand fonts — bundled

The app now ships with the Good Loop typefaces from the identity book, applied
across the **whole app** (B2C, B2B, and the Studio):

- **Fragment Sans** (PP Fragment) — display / headings
- **TT Commons Pro** — body / UI

## What's included

Converted to `.woff2` (≈40% the size of the source OTF) and placed in
`public/fonts/`. Only the weights the UI actually uses are bundled:

```
public/fonts/
  FragmentSans-Light.woff2       (300)
  FragmentSans-Regular.woff2     (400–600 — display headings)
  FragmentSans-ExtraBold.woff2   (700–800)
  TTCommons-Regular.woff2        (400)
  TTCommons-Italic.woff2         (400 italic)
  TTCommons-Medium.woff2         (500)
  TTCommons-DemiBold.woff2       (600)
  TTCommons-Bold.woff2           (700)
```

The `@font-face` rules are in `src/index.css`. Fragment Sans has only Light /
Regular / ExtraBold, so the Regular face answers the 400–600 weight range the UI
requests (no synthetic bold), and ExtraBold covers 700+. `index.html` preloads
the two Regular faces so there's no flash of fallback text. Nothing is loaded
from Google Fonts anymore — fully self-hosted, works offline.

## ⚠️ Licensing before launch

The files you sent are **not yet production-licensed**:

- **PP Fragment** is the *"Free for Personal Use"* build (the EULA is in your
  zip). A commercial licence from Pangram Pangram is required to ship it.
- **TT Commons** came from a free font-host, not the TT Commons **Pro** foundry
  release. The proper licence is from TypeType.

They're fine for internal builds and the closed beta, but both need a real
licence (or a substitute) before any public release. The wiring won't change —
just drop the licensed `.woff2` files over these with the same names.
