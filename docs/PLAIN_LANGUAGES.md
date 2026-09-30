# Two languages in one protocol — Italian and Portuguese

A protocol is **one mix spoken in several languages**. The timing, the levels,
the fx, the pool draws and the fades are the same in every language; what
changes with the language is the **text** of the voice clips and the **voice**
that speaks it. The spoken languages today are Italian (`it`) and Portuguese
(`pt-BR`). English text can already be written and is stored; nothing voices it
yet. The type that decides this is `VoiceLang` in `src/tts/voiceLang.ts` —
adding English there is the whole change when it is voiced.

## 1. The Excel — one text column per language

In the **clip sheets** (Quick / Standard / Deep) and in the **Affermazioni**
sheet:

| column | language | notes |
|---|---|---|
| `testo` | Italian | the column every workbook already has |
| `testo_it` | Italian | alias of `testo`, for sheets that name every language |
| `testo_pt` | Portuguese (Brazil) | also read as `testo_pt-br`, `testo_ptbr`, `testo_br` |
| `testo_en` | English | stored for later; not voiced yet |

Headers are matched case-insensitively. **Everything else on the row is
shared** by every language: `start_s`/`end_s`, levels, fades, `fx`,
`archetipo`, `modalita`, `set_affermazioni`, `sequenza`… A whispered refrain
is split on `...` **per language**; the Italian fragments set the cadence and
fragment *i* of each language rides on clip *i*.

Validation:

- a file with **no `testo_pt` column at all** is valid — Italian-only, one info
  line says so;
- a clip (or affirmation) with Italian text but no Portuguese is an **info**
  line ("nessun testo portoghese ancora"), never an error;
- a `linea` clip with no text in any language is still an error; one with
  Portuguese but no Italian is a warning.

## 2. Importing — compare, then add

Importing an Excel into a protocol that already has work **adds**; it never
deletes what was done. Before anything is written the workscreen shows what
the file changes against what is stored for that duration — new languages,
lines whose text changed (per language), clips added or removed, timing or
parameter changes, or "identico: niente da importare" — and the admin confirms
or cancels.

The merge (`mergeScripts` / `planPlainImport` in `src/admin/publishPlain.ts`):

- **structure and parameters come from the file** — it is the score;
- **text is merged per language**: a language the file lacks, or a clip /
  affirmation it leaves empty, **keeps the stored text** (clips matched by
  `clip_id`, affirmations by `id`). Re-importing last month's Italian-only
  file never wipes the Portuguese;
- **only the selected duration is written.** Another duration in the same file
  is written only when the protocol has no timeline for it yet (a 6-minute
  file imported under the 12m chip no longer overwrites the 6-minute version);
- Studio sessions, published audio, names, tags and cover are never touched.

## 3. The Studio — one session, a working language

Opening a protocol's session ("Modifica nello Studio", or a saved session)
asks **"In che lingua vuoi lavorare?"** — Italiano / Português. The top bar
shows the working language (IT / PT) and switches at any time; switching folds
the current language away and brings the other back, so nothing is lost in
either direction. Saving saves every language together (one session per
duration, as before).

A session saved before this existed holds Italian only. Opened in Portuguese,
each clip finds its Portuguese in the stored timeline — by source id
(`clip:<clip_id>`, `aff:<id>`, `aff:<id>#<fragment>`), or for older sessions by
its Italian text. A clip with no Portuguese is marked **⚠ senza testo** and
stays silent; it is never spoken in Italian by accident.

## 4. Voices — ITA and BRA

ElevenLabs voices carry their language in the **name**: `ITA …` / `… - ITA`
is Italian, `BRA …` / `… - BRA` is Portuguese (`[ok] ITA MATERNAL (F)`,
`BRA - MATERNAL`, `[ok] PATERNAL - BRA` all parse). A voice with no marker is
Italian. The selection rules are unchanged — archetype from `archetipo`,
gender, whisper swap for `sussurrato`, the defaults — but only **among the
voices of the working language**. A language with no voice for an archetype
falls back to its own default, then any voice of it; with no voice at all the
notes say so.

## 5. Publishing and playback

Publish (and **Carica audio** for a mastered file) asks which language the
audio is for. The render uses that language's texts and voices and the file is
stored at `<code>/<duration>min-<lang>.mp3`, written **only** into
`versions[].audioUrl[<lang>]` — the other language's file stays. A duration is
"published" when any language has a file; the console shows which (`IT ✓ · PT —`).

Playback follows the person's app language: `it` → Italian, `pt-BR` →
Portuguese, `en` → Portuguese. When the wanted language has no file the other
one plays, so nobody loses a session that exists in only one language.

Everything published before this change was Italian but filed under `pt-BR`;
`supabase/12-audio-language.sql` moves it to `it` (idempotent).

## Proof

`tools/test-voice-lang.ts` — the parser's language columns, the merge rules,
the voice-name parsing and language-aware selection, the session language
switch and the playback choice.

```
npx esbuild tools/test-voice-lang.ts --bundle --platform=node --format=esm \
  --external:xlsx "--define:import.meta.env={}" --outfile=tvl.mjs && node tvl.mjs
# from the repo root, so the external xlsx resolves; delete tvl.mjs after
```
