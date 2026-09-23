# Fonts — Roboto, bundled

The whole product is set in **Roboto**: the Self Use app, the Therapist
Workspace, the company dashboard, the admin console and the Sound Studio.
Headings, body and UI all draw on the same family; anywhere digits have to line
up in a column — timecodes in the Studio, licence numbers, company codes — uses
**Roboto Mono**, so even those stay in the family instead of falling back to
whatever monospace the machine happens to have.

## Served from here, never from Google

The faces live in `public/fonts/` and are referenced with plain `/fonts/…`
URLs. There is no `fonts.googleapis.com` link anywhere, and that is deliberate:
a `<link>` to Google Fonts makes every visitor's browser announce its IP
address to a third party before the first word is drawn. For a mental-health
app under LGPD and GDPR that is not a trade worth making for one line of HTML.

## What is bundled

The variable faces, so a single file per subset covers every weight from 100 to
900 — no synthetic bolding, and no eight-file download.

```
public/fonts/
  Roboto-Roman-latin.woff2          42 KB   weights 100–900
  Roboto-Roman-latin-ext.woff2      29 KB
  Roboto-Italic-latin.woff2         46 KB   weights 100–900, italic
  Roboto-Italic-latin-ext.woff2     31 KB
  RobotoMono-Roman-latin.woff2      32 KB   weights 100–700
  RobotoMono-Roman-latin-ext.woff2  22 KB
```

Latin and Latin Extended only. Italian, Portuguese and English are covered by
the first file; each `@font-face` carries the `unicode-range` Google publishes,
so a browser fetches the `-ext` file only if a page actually needs a character
from it. `index.html` preloads `Roboto-Roman-latin.woff2` — the one face every
screen needs — to avoid a flash of fallback text.

Roboto is licensed under the Apache License 2.0: free to bundle, ship and
modify, commercially, with no attribution required in the interface.

## How it is wired

Three tokens in `src/index.css`, and everything else reads them:

```css
--display: 'Roboto', system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
--sans:    'Roboto', system-ui, -apple-system, 'Segoe UI', Arial, sans-serif;
--mono:    'Roboto Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace;
```

`--display` and `--sans` are the same family now, but both are kept: the
distinction is still meaningful in the stylesheets, and it is what a later
change back to a two-face brand would turn on again. `--gl-display` and
`--gl-body` are aliases of the two.

To change the whole product's typeface, change these three lines and the
`@font-face` block above them. Nothing else names a family.

## The previous typefaces

Fragment Sans (display) and TT Commons Pro (body/UI), from the identity book,
are still in `public/fonts/` as `FragmentSans-*.woff2` and `TTCommons-*.woff2`.
Nothing references them; they are kept because they are licensed brand assets
and putting them back is then a question of editing three tokens rather than
finding the files again.
