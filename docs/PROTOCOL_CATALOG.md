# Publishing a protocol — time signatures, names, tags

Reference for whoever publishes material into the catalog. Three things changed
and this file is the contract for all three.

---

## 1. One protocol, up to three time signatures

`GL-ANX 1.1` is **one catalog row**. Its 6-, 12- and 24-minute versions are
three *time signatures* of that row, and each one is its own material:

| what | where it lives | scope |
|---|---|---|
| the workbook (PLAIN Timeline) | `protocols.plain_by_duration` → `{"6":…, "12":…, "24":…}` | per duration |
| the saved Sound Studio session | `protocols.studio_by_duration` | per duration |
| the streaming audio URL | `versions[].audioUrl[<lang>]` — `it` / `pt-BR` | per duration, per spoken language |
| code · family · phases · titles · tags | the row itself | shared |

### The rule

> **Publishing or editing one time signature must leave the others exactly as
> they were** — their timeline, their Studio session, their attached audio.

This is enforced in three places, and a change to any of them needs the proof
in `tools/test-publish-versions.ts` to still pass:

- `PlainImport.publishToCatalog()` — merges the incoming durations into what
  the catalog already has (`mergeVersions`) and writes each sheet into its own
  slot (`narrowTimeline`).
- `SoundStudio.saveToProtocol()` — writes the session under the duration being
  edited and spreads the existing entry first, so nothing it does not know
  about is dropped.
- `attachRenderedAudio()` — touches one version and ONE language of it
  (`audioUrl[lang]`); the other language's file stays. See
  `docs/PLAIN_LANGUAGES.md` for the two-language model (Excel columns,
  import merge, Studio working language, publish and playback per language).

### What it used to do (the bug)

Publish rebuilt `versions` from the workbook on screen and replaced `plain`
with it. Publishing the 12-minute file therefore **deleted the 6- and
24-minute version rows and the audio already attached to them**, without any
message. The same protocol could only ever have one live duration at a time.

### Reading it in code

Never read `plain` or `studio` directly — they are last-written mirrors kept
only so a row from before the split still opens. Use `src/data/catalog.ts`:

```ts
plainFor(p, 24)      // that duration's timeline (falls back into legacy `plain`)
plainDurations(p)    // [6, 12, 24] — the ones that actually have material
mergedPlain(p)       // one timeline holding every duration → the workscreen chips
studioFor(p, 12)     // that duration's saved session
mergeVersions(a, b)  // union, never a replacement
```

### In the console

- The catalog list has a **Durate** column: one pill per time signature —
  green = audio in linea, amber = timeline pubblicata senza audio, grey =
  nessuna timeline. Clicking a pill opens the workscreen on that version.
- The workscreen's chips (`6m · 12m · 24m`) mark published (`·`) and live
  (`✓`). **Every action on that screen applies to the selected chip only.**
  Publishing says so explicitly: "Le versioni da 6 e 24 min restano invariate."

### Migration

None to run by hand. A row written before the split keeps working: its single
`plain` is split per sheet on read, and the first publish after the upgrade
writes the per-duration slots. Run the updated `supabase/setup.sql` (it adds
the columns and reloads the PostgREST schema cache in one shot).

### Publishing both forms at once

A listener is offered only their own form (`audioPick`), so a protocol live
in the male form and not the female **does not exist** for everybody who
chose the other one. Pubblica therefore offers, first:

> **Italiano · le due forme** — *consigliato*

It writes the catalog row once, renders the male take, then renders the
female one **sharing the first render's voice cache**. The cache is keyed on
`voiceId|lang|text`, and the voice does not depend on the form — it follows
the archetype and the spoken language, who is TALKING, while the form is who
is being talked TO (`plainStudio.ts`). So a line whose words are identical in
both scripts is synthesized once, and only the lines that actually inflect
are sent to the engine a second time.

On a real protocol that is most of the sheet: a 24-minute workbook is around
sixty voice clips and perhaps eight carry a gendered word. The status line
says what it cost — *"28 clip sintetizzate in tutto, 24 riusate dal render
maschile"*.

The four single-variant buttons stay underneath, for re-rendering one
corrected take. The pair is not offered for a **mastered upload**: an
uploaded file IS one form, and there is nothing to render the other from.

Proof: `tools/test-both-forms.ts`.

---

## 2. Two names: clinical and public

Every clinical protocol can carry two names, and they do different jobs.

| | field | who reads it | register |
|---|---|---|---|
| clinical title | `title` | therapist, admin, clinical record | names a therapeutic intent — *"Calm and Inner Security"* |
| public name | `publicTitle` | **the person listening** | names a moment — *"Un respiro prima di dormire"* |

`publicBlurb` is the one-liner that goes with `publicTitle`.

**Setting a public name changes the LABEL and nothing else.** The code, the
family, the pathway, the plan, the audio and the clinical record are untouched,
so the same material can be offered without clinical vocabulary while remaining
the same material. Leave it empty and the clinical title is shown — exactly what
every entry did before this field existed.

Resolved through `patientTitle(p)` / `patientBlurb(p)` (`src/types/domain.ts`),
which is what the player, the home card, the history, the library card and the
consultation call all print.

### Writing a good public name

Same register the library already uses (`src/data/library.ts`): say the
**moment**, never the condition, the diagnosis or the treatment.

- ✅ "Un respiro prima di dormire", "La mezz'ora prima di un esame",
  "Quando la testa è troppo piena"
- ❌ "Protocollo ansia 1.1", "Trattamento del burnout", "Terapia del sonno"

This is the same boundary `audience` enforces between clinical material and the
free-use library — Good Loop is a **mitigation** tool, and a name that promises
treatment is a claim the product does not make.

### Where to edit it

Catalog → **Percorsi clinici** → the row's **✎ Scheda** button, or the
workscreen's **Dettagli → Scheda pubblica e tag**.

The **clinical title is editable there too**. It arrives from the workbook on
import, and a catalogue assembled from workbooks written by different people
ends up with different naming conventions; bringing it to one house style
should not require re-importing the material. Renaming changes the LABEL only —
the code, the family, the versions, the timelines, the Studio sessions and the
rendered audio are all carried through untouched (`applyCardDraft` spreads the
existing entry, and `tools/test-publish-versions.ts` asserts it).

Two things to know before renaming:

* A **blank is refused.** An empty clinical title would leave the catalog row,
  the plan and the clinical record showing nothing but a code.
* Where **no public name is set**, `patientTitle()` falls back to the clinical
  one — so renaming also changes what the PERSON reads for that entry. If the
  new clinical name is not something a person should read, write a public name
  at the same time.

---

## 3. Tags

Editorial metadata for finding and grouping published material. The vocabulary
lives in `src/data/tags.ts`; ids are ASCII slugs (stable), labels are Italian.

**Three rules:**

1. **A tag is never a clinical claim.** It says `sera` or `cuffie`, not
   "cura l'insonnia". The `need` group reuses the six neutral words the
   check-in already uses, so nothing new enters the clinical vocabulary.
2. **A tag never routes a session.** The wizard, the plan and the program keep
   deciding by protocol code exactly as they did. Tags filter lists.
3. **Duration is not a tag.** The three time signatures are structural (§1).
   `DURATION_TAG_IDS` exists only so a filter row can offer `6 min · 12 min ·
   24 min` next to the real chips; they resolve against `versions`.

### The vocabulary

| group | what it answers | tags |
|---|---|---|
| **need** — *A cosa serve* | how the person feels when they open it | `ansia` · `stress` · `umore-basso` · `esaurimento` · `resilienza` · `mantenimento` · `sonno` · `concentrazione` · `energia` · `radicamento` |
| **moment** — *Quando* | time of day or of the week | `mattina` · `pausa` · `sera` · `notte` · `prima-di` · `dopo-il-lavoro` · `primo-ascolto` |
| **delivery** — *Come suona* | voice, breath, pure sound | `voce-guidata` · `voce-femminile` · `voce-maschile` · `sussurro` · `solo-suono` · `binaurale` · `bilaterale` · `solfeggio` · `affermazioni` |
| **setting** — *Dove* | where the person is | `cuffie` · `a-letto` · `scrivania` · `in-movimento` · `occhi-chiusi` |

The list is curated but **not closed**: the card editor's "Altro" field accepts
any word the POs invent (slugged and shown back with a readable label), so the
console never blocks on a missing term. Adding it to `PROTOCOL_TAGS` just gives
it a proper label and a group to sit in.

Max **12** tags per protocol (`MAX_TAGS`). Past that a tag stops narrowing
anything.

### The theme is not a tag

The word a person reads under a cover in the library — *Calma*, *Foco*,
*Energia*, *Equilíbrio*, *Crescimento* — is the **theme**, and it is not one
of the tags above. It used to be read from `library.category` alone, which
only the Library editor writes by hand; nothing in the import and publish
pipeline sets one. So every protocol published from a workbook fell through
to a `?? 'calm'` and the whole shelf came out tagged Calma.

It now falls back to the **family in the code** before it falls back to a
constant (`themeOf`, `src/data/liveCatalog.tsx`):

| code | theme |
|---|---|
| `GL-CALM` · `GL-INTRO` | calm |
| `GL-FOCUS` | focus |
| `GL-ENER` | energy |
| `GL-GROW` | growth |
| `GL-VIT` | balance |

An explicit `library.category` still wins — a PO who chose one in the editor
meant it. Nothing had to be migrated or re-published: the derivation is on
read, so every row already in the catalogue was right on the next page load.

Proof: `tools/test-both-forms.ts`.

### Filtering

The catalog's chip row lists the tags **actually in use** on the current shelf,
most-used first, plus the three durations. Selecting several is an **AND** —
each chip narrows. `filterByTags()` is the single implementation.

---

## Proof

`tools/test-publish-versions.ts` — 68 assertions covering all three sections,
including the reported bug replayed as the POs hit it (publish 24 → attach →
publish 12 → publish 6, all three still live) and the legacy-row migration.

```
node_modules/.bin/esbuild tools/test-publish-versions.ts --bundle \
  --platform=node --outfile=$TEMP/tpv.cjs && node $TEMP/tpv.cjs
```
