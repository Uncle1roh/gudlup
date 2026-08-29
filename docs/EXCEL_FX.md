# Effects and non-uniform loops in the PLAIN Timeline Excel

Two columns, both optional, both readable by the app: **`fx`** and
**`sequenza`**. Neither exists in the original Rules doc; both are additive,
so every workbook already written keeps importing exactly as before.

---

## 1. The `fx` column

### Where it goes

One more column on the clip grid, anywhere in the header row (order never
matters — the parser reads headers by name). Call it **`fx`**; `effetti` is
accepted as a synonym.

| clip_id | traccia | tipo  | start_s | end_s | … | fx                          |
|---------|---------|-------|---------|-------|---|-----------------------------|
| VC-014  | VOX_A   | Voice | 312     | 341   | … | `eco(ritardo=0.8, mix=35%)` |

### What it means

Effects in this engine live on the **track**, not on the single clip — that is
how the Studio's rack works and how the mixdown is wired. So `fx` is a
statement about the whole `traccia`: write it once, on the track's first clip.
If two clips of the same lane disagree, the last one read wins and the import
notes say so.

The `eco` / `eco_ritardo_s` / `eco_volume_db` and `riverbero_pct` columns still
work exactly as before. `fx` stacks **on top** of them, so a whispered line can
keep its `eco=on` companion lane and add a reverb through `fx`.

### Writing it

```
eco                                     the effect at its defaults
eco + riverbero                         two effects
eco; riverbero                          ";" separates too
eco, riverbero                          so does a plain comma (outside brackets)
eco(ritardo=0.8, mix=35%)               parameters in brackets
riverbero(coda=3.2s, mix=25%)
coro(voci=4, apertura=28, ottava=on)
saturazione(drive=6, mix=50%)
filtro(modo=passa-basso, taglio=4kHz)
off                                     explicitly no effects
```

Everything is case-insensitive, spaces around `=` are fine, `:` works instead
of `=`, and a decimal comma parses like a decimal point.

### The five effects

| Write            | Also accepted                              | What it does |
|------------------|--------------------------------------------|--------------|
| `eco`            | `echo`, `emotional echo`, `eco emotivo`    | The **Emotional Echo** — warm repeats trailing the voice |
| `riverbero`      | `reverb`                                   | Space around the sound, room → cathedral |
| `coro`           | `harmonizer`, `armonizzatore`, `coral`     | Detuned copies — one voice becomes a small chorus |
| `saturazione`    | `saturation`, `warmth`, `calore`           | Soft warmth at low drive, distortion at high |
| `filtro`         | `filter`                                   | Low-pass (darker) / high-pass (thinner) |

### The parameters

| Effect | Parameter | Also accepted | Range | Default |
|--------|-----------|---------------|-------|---------|
| `eco` | `ritardo` | `delay` | 0.15 – 2 s | 0.6 s |
| | `ripetizioni` | `feedback`, `repeats` | 0 – 0.7 (or `0…70%`) | 0.35 |
| | `tono` | `tone`, `calore`, `warmth` | 800 – 6000 Hz | 2500 Hz |
| | `mix` | `livello`, `level` | 0 – 1 (or `0…100%`) | 0.30 |
| `riverbero` | `coda` | `decay`, `decadimento` | 0.8 – 8 s | 2.6 s |
| | `mix` | `livello`, `level` | 0 – 1 | 0.25 |
| `coro` | `voci` | `voices` | 2 – 5 | 3 |
| | `apertura` | `spread`, `cents` | 8 – 50 cents | 22 |
| | `ottava` | `octave` | `on` / `off` | off |
| | `mix` | `livello`, `level` | 0 – 1 | 0.50 |
| `saturazione` | `drive` | `spinta`, `gain` | 1 – 12 | 3 |
| | `mix` | `livello`, `level` | 0 – 1 | 0.50 |
| `filtro` | `modo` | `mode`, `tipo` | `passa-basso` / `passa-alto` (also `lp` / `hp`) | `passa-basso` |
| | `taglio` | `cutoff`, `freq`, `hz` | 80 – 12000 Hz (`4kHz` works) | 8000 Hz |

Parameters you do not write keep their defaults. **A `mix` or a
`ripetizioni` written above 1 is read as a percentage** — `mix=30` and
`mix=30%` are the same thing, because the sheets already say `riverbero_pct`
elsewhere and that is what POs mean.

### When something is wrong

Nothing is guessed at and nothing fails silently:

* a value out of range is **clamped** to what the effect accepts, and the
  import lists the clamp;
* an unknown effect name or parameter is listed as an import **warning**, and
  the rest of the cell still applies;
* the seeding notes say, per lane, exactly which rack came from which cell.

### Order

Fixed and musical, whatever order the cell writes them in:

```
[coro] → saturazione → filtro → eco → riverbero → fader → pan → master
```

`coro` is applied to the clip's own audio (it layers pitch-shifted copies), the
other four are bus effects. Both the live Studio and the published render apply
all five — what you hear while editing is what ships.

---

## 2. The `sequenza` column

For **non-uniform loops**: a `tipo_contenuto=loop` row where the affirmations
do not fall on a regular `intervallo_s` grid.

```
sequenza
────────────────────────────────────────────────
CSI-01@0; CSI-05@60; CSI-09@2:00     seconds or m:ss, from the clip's start_s
CSI-01; CSI-05; CSI-09               no offsets → intervallo_s apart
CSI-01@0; CSI-05; CSI-09@3:30        mixed — the bare ones take their turn
```

* Offsets are counted from the row's own `start_s`, not from the session start.
* IDs are resolved against the **Affermazioni** sheet; one that is not there is
  an import **error**.
* A step falling past the row's `end_s` is not placed, and the import says so.
* `sequenza` **replaces** the uniform cadence for that row: if a row has both
  `sequenza` and `set_affermazioni`, the sequence is what plays.

### Why this column exists now

It was in the format from the start, and the app read it — into an info message
saying "non-uniform loops are expanded at seeding". Seeding never expanded it.
A loop row carrying only a `sequenza` therefore built its voice lane, placed
zero clips on it, and handed over a track that is visible in the Studio and
completely silent. That is what `VOX_C_SUSSURRO · loop` was doing on
GL-ANX 1.1 · 24 min.

Two things changed together:

1. `sequenza` is expanded (this column).
2. **A loop that resolves to no affirmations is now an import error**, and a
   lane that ends up with no clips is the first line in the seeding notes:
   `⚠ "…": nessun clip — la traccia esiste ma non suona.` A track that cannot
   make a sound is never shipped quietly again.

---

## Proof

`tools/test-plain-fx.ts` — 56 assertions: the grammar, the clamps, the
Italian/English aliases, the rack landing on the right lane (including the
split `· eco` and `· loop` companions), `sequenza` expansion, the silent-lane
report, and a round trip through a real generated `.xlsx`.

```
node_modules/.bin/esbuild tools/test-plain-fx.ts --bundle --platform=node \
  --define:import.meta.env={} --outfile=$TEMP/fx.cjs && node $TEMP/fx.cjs
```
