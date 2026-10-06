# Icon and splash sources

`@capacitor/assets` reads this folder. Both PNGs are untouched copies of the
1900×1900 master in `Good Loop Visual ID/` — the cream mark, on transparency.
No recolour, no redraw: the rule in `src/components/Brand.tsx` applies here
too.

To regenerate every Android density after a brand change:

```bash
npx @capacitor/assets@3 generate --android \
  --iconBackgroundColor '#009b77' --iconBackgroundColorDark '#009b77' \
  --splashBackgroundColor '#061710' --splashBackgroundColorDark '#061710'
```

The two background colours are not decoration and should not be dropped:

* **`#009b77`** is brand green, behind the cream mark in the launcher icon.
  Android masks adaptive icons to whatever shape the launcher wants, so the
  background has to be a real colour — a transparent one renders as white.
* **`#061710`** is `--deep-2`, the ground the app's own first screen is
  painted in. Leaving it out gives you the default white, and a cream mark on
  white is very nearly invisible — which is exactly what the first run of this
  generator produced.
