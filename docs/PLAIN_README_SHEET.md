# The README sheet of a PLAIN workbook

**It is not new.** The importer has read this sheet since the PLAIN format
existed — it is where the protocol's code, its title and its phase map come
from. What changed recently is only that the phase map now travels on into the
Sound Studio, where one rule needs to know which part of a session is the
closing. Nothing about how you write the sheet has changed.

There was no written spec for it, which is what this file fixes. The authority
is still `parseReadme()` in `src/admin/plainTimeline.ts`; everything below was
read off that function.

## Where it goes

One sheet in the workbook whose **name contains `README` or `LEGGIMI`** (any
case). Without it the import still works — the code, the title and the phases
are inferred from the clip sheets — and you get an info line saying so.

Only **columns A and B** are read. Every other column, and every row not listed
below, is ignored: notes to yourselves are safe anywhere on the sheet.

## The template

| A | B |
|---|---|
| `GOOD LOOP — GL-ANX 1.1` | |
| `Calma e Sicurezza Interiore — v2.0` | |
| `Metodologia` | `Voce guidata + binaurale 6 Hz, fasi 1–6` |
| `Sorgente` | `Spec PO 2026-03, rev. B` |
| | |
| `Schema fasi` | |
| `Fase 1 — 0:00 - 1:45` | `Intro + Validazione` |
| `Fase 2 — 1:45 - 4:30` | `Radicamento` |
| `Fase 3 — 4:30 - 9:00` | `Lavoro` |
| `Fase 4 — 9:00 - 15:30` | `Elaborazione` |
| `Fase 5 — 15:30 - 21:00` | `Integrazione` |
| `Fase 6 — 21:00 - 24:00` | `Chiusura` |

That is the whole sheet. Row by row:

**The code** — the first cell in column A containing something shaped like
`GL-XXX 0.0`. `GOOD LOOP — GL-ANX 1.1` works; so does the bare code. It is what
files the timeline in the catalog, so it has to be the code of the protocol you
are actually importing.

**The title** — the first non-empty cell in column A **within the first five
rows** that is not the `GOOD LOOP` line and does not start with `Target`,
`Durata`, `Metodologia`, `Sorgente` or `Schema`. The line is then split on its
dashes and the parts that are not the protocol's name are dropped: the code, a
version (`v2.0`), a duration (`DEEP 24 MIN`), the word `README`. So a header
line like

```
GL-ANX 1.1 — CALMA E SICUREZZA INTERIORE — DEEP 24 MIN — README
```

gives the title `CALMA E SICUREZZA INTERIORE`. It is used only when the code is
new to the catalog — importing into a protocol that already exists keeps the
title it has.

**`Metodologia` / `Sorgente`** — either the word alone in column A with the
value in column B, or `Metodologia: <value>` in one cell. Both optional, both
carried as metadata.

**The phase map** — column A, in either of the two forms the workbooks use:

```
Fase 1 — 0:00 - 1:45          (Standard 12 min)
F1 - 0:00 - 3:00              (Deep 24 min)
```

- `Fase` or just `F`, then one digit 1–9.
- Either dash may be `—`, `–` or `-`, on both sides.
- Times are `m:ss` or `mm:ss` — **minutes and seconds only**. `21:00` is
  twenty-one minutes. `1:02:03` is not read and the row is skipped in silence.
- Column B is the phase's label, shown in the importer's timeline. Optional; it
  defaults to `Fase <n>`.

**A row with no times is not a map.** `F1 Intro + Validazione` — which is what
the Quick 6-minute workbook writes — is a heading, and the importer treats it
as prose: the phases then come from the `fase` column instead. That fallback
runs, but it is not what you wrote: where clips span phases (`fase` = `1-2`)
the derived windows overlap each other. **Write the times.**

## When the map is used, and when it is not

A workbook holds one README and up to three clip sheets (Quick / Standard /
Deep), so the map cannot be right for all of them. The importer takes it only
when **both** are true:

1. there are **exactly six** phases, and
2. the sixth one ends **within 90 seconds** of that sheet's own length.

Otherwise the phases are derived from the **`fase` column** of the clip rows —
first start and last end of each phase number — and you get an info line saying
the README map did not match this sheet. That fallback is good enough for
everything the app does with phases today, so a workbook with no map is not
broken. It is just less exact than what you wrote.

Practically: **write the map for the version whose length it matches** (usually
the 24-minute one), and let the other sheets fall back to their `fase` column.
If you want all three exact, give each version its own workbook.

## What the phases are used for

- **Validation** — §8.0 warnings in the importer: a binaural in phase 3 or 4, a
  solfeggio in phase 4, and so on. Warnings, never refusals.
- **The Studio's overlap rule** — two voices that collide in **phase 6** are
  separated in time by one second and stay centred, and the closing's music is
  stretched to the last voice so the fades stay together. Anywhere else, two
  centred voices that collide are separated in the stereo field instead. See
  `src/studio/voiceOverlap.ts`.

The second one is why the map is worth writing rather than leaving to the
fallback: the `fase` column gives phase 6 the extent of the clips labelled 6,
which is usually right, but the README map is what you actually decided.
