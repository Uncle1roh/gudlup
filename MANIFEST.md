# Good Loop — build manifest

**Slice: publishing overwrote the other time signatures** (current)
- PO report: "the same protocol has a 6-, 12- and 24-minute version, and when
  we publish it overwrites the other time signatures".
- **Reproduced and true.** `publishToCatalog()` rebuilt `versions` from the
  workbook ON SCREEN (`durations.map(...)`, so any duration not in that file
  disappeared) and replaced `plain` with it wholesale. Publishing the 12-minute
  file therefore deleted the 6- and 24-minute version rows **and the
  `audioUrl` attached to them** — the streaming copy was silently detached and
  the protocol fell back to the placeholder bed. Nothing said so.
- Second, quieter instance of the same bug: `SoundStudio.saveToProtocol()`
  wrote ONE `studio` session per CODE, so editing the 24-minute mix discarded
  the 6-minute session. `ensureCatalogProtocol()` also rebuilt the entry field
  by field instead of spreading it, which dropped `audience` and `library` —
  a Studio save on a library audio quietly turned it into clinical material.
- **Model** (`data/catalog.ts`): `plainByDuration` and `studioByDuration`,
  `Partial<Record<Duration, …>>`. `plain` / `studio` stay as last-written
  mirrors so a row from before the split still opens, and readers go through
  `plainFor` / `studioFor` / `mergedPlain` / `plainDurations` — never the raw
  fields. `mergeVersions()` is the union that replaced the rebuild: every
  duration already in the catalog survives with its `audioUrl` intact.
  `narrowTimeline()` stores one sheet per slot rather than the whole workbook
  three times. Rows written before the split MIGRATE on read (their single
  `plain` is split per sheet), so nothing has to be re-imported.
- **UI**: the catalog gains a **Durate** column — one pill per time signature,
  green (audio in linea) / amber (timeline pubblicata, audio non collegato) /
  grey, and clicking one opens the workscreen on that version. The workscreen's
  chips mark published (`·`) and live (`✓`) per duration, "in linea ✓" is now
  computed for the SELECTED chip instead of "any version has audio", and the
  publish confirmation names what it left alone ("Le versioni da 6 e 24 min
  restano invariate").
- **Two names.** `publicTitle` / `publicBlurb` on the domain `Protocol`:
  `title` stays the CLINICAL name (therapist, admin, clinical record), the
  public one is what the PERSON reads — the moment, never the condition, the
  same register `data/library.ts` already uses. Resolved through
  `patientTitle()` / `patientBlurb()` and wired into the player, the home card,
  the history, the library card and the consultation call. Empty → the clinical
  title, i.e. every screen behaves exactly as before until a PO writes one.
  Setting it changes the LABEL only: code, family, pathway, plan, audio and
  clinical record are untouched.
- **Tags** (`data/tags.ts`): 32 curated ids in four groups (need · moment ·
  delivery · setting), Italian labels, ASCII slugs, max 12 per protocol, and an
  open "Altro" field so the POs are never blocked on a missing word. Three
  rules enforced in the code and the doc: a tag is never a clinical claim, it
  never routes a session, and DURATION IS NOT A TAG (the duration chips in the
  filter row resolve against `versions`). Catalog filter row lists the tags
  actually in use, most-used first; several chips AND together.
- New `admin/ProtocolCard.tsx` — the public card editor (name + tags), on the
  clinical shelf's ✎ Scheda and folded into the workscreen's Dettagli. It owns
  naming and tags and NOTHING else: versions, timelines, sessions and audio are
  carried through untouched (asserted).
- SQL: `plain_by_duration`, `studio_by_duration`, `public_title`,
  `public_blurb`, `tags` as defensive `add column if not exists`; the existing
  `notify pgrst, 'reload schema'` at the end of setup.sql covers them.
- `docs/PROTOCOL_CATALOG.md` is the reference for all three (the rule, the
  vocabulary, how to write a public name, what NOT to read directly).
- `tools/test-publish-versions.ts` (68 assertions) replays the bug as the POs
  hit it — publish 24 → attach → publish 12 → publish 6, all three still live
  with their own clip counts — plus the legacy-row migration, the multi-sheet
  workbook, the 15-minute fallback, per-duration Studio sessions, both naming
  fallbacks and the tag filter. `tsc --noEmit` + `npm run build` clean; all
  prior proofs re-run and pass (pools 18, shape 19, mastering 14, library-plan
  51, bilateral 31, whisper 15, music-playlist 38, nr1 42, tts-request 27,
  tts-block 19). The workbook-driven proofs (test-plain, test-plain-lufs,
  test-plain-studio, test-plain-deep) need the PO's .xlsx passed as argv and
  were not run here — unchanged by this slice.

**Slice: the music queued ONE song — a bad duration estimate**
- PO report, after the playlist slice shipped: "the music still plays only one
  song instead of filling the phase time with different songs".
- **The playlist machinery was fine; the arithmetic that feeds it was not.**
  `estimateAssetSeconds()` decides how many songs a clip queues, and it assumed
  **192 kbps**. The library is ripped albums at 256–320 kbps, so every estimate
  came out ~1.7× too LONG: `1-02 Coming Home.mp3` (19 MB) was called 13 minutes
  when it plays for ~8, and `Essence of Kryon.mp3` clamped to the 900 s ceiling.
  One song therefore "covered" a whole phase, the draw stopped at one, and —
  because a song must never loop — the rest of the window fell silent.
- The old comment had the direction backwards: it claimed 192 was a HIGH bitrate
  that would yield a short estimate and over-draw. Assuming a bitrate BELOW the
  real one yields a LONG estimate and starves the draw. The safe direction is
  the short one: under-estimate, queue one song too many, let the renderer cut.
- **Fixes**: `ASSUMED_KBPS = 320` (the top of what the library carries, so the
  estimate runs short); uncompressed formats are computed as arithmetic rather
  than guessed as MP3 (`.wav/.aif` ÷ 44 100·2·2 — the one WAV in the library is
  ~4½ min, which the old code called 15); and `OVERDRAW = 1.25` queues past the
  window before stopping, because one song too many costs a fetch the renderer
  discards while one too few is audible silence mid-phase.
- **The five editable gaps are gone.** Choosing songs by hand was the part that
  did not work, and the draw covers the window on its own. `SamplePlaylist` is
  replaced by `SampleQueue`: the same readout — numbered songs, REAL decoded
  lengths, the fill meter — but read-only. The library picker remains as a
  single-song override that replaces the queue, and 🎲 redraws it.
- `slots` / `MAX_SAMPLE_SLOTS` / `sampleSlots()` stay in the MODEL: the renderer
  needs an ordered list to sequence and crossfade. Only the editor is gone.
- `tools/test-music-playlist.ts` grows to 38 assertions, built from the REAL
  byte counts in `assets/music`: each file's estimate against what it actually
  plays for, the WAV case, and the regression itself — an 8-minute phase drawn
  from the four LONGEST f4 files must queue ≥ 2 distinct songs on every seed.
- Known edge: with unusually short songs the 5-song cap can still leave a window
  uncovered; the draw reports `short` and the Inspector says so. Raising the cap
  was deliberately not done — each queued song is decoded in full, so the memory
  cost is real.

**Slice: hardening pass — privacy, crash-resistance, leaks**
- **NR-1 k-anonymity had real holes.** CLAUDE.md is binding ("aggregates only,
  k-anonymity suppression, no individual records reach the client"), and the
  old `aggregate()` hid a small TEAM's split while publishing everything around
  it, which is not the same thing. Four attacks, each now closed and tested:
  · **Tiny cycle.** The report published `overall`, `dimensions`, `outcomes`
    and `trend` regardless of how few people responded. With one respondent,
    `overall` WAS that person's risk profile. Below k the whole cycle is now
    suppressed and only the headcount survives; the dashboard says so instead
    of drawing zeroes, which read as "no risk found".
  · **Differencing.** One hidden team + the company total + every other team
    gives the hidden split by subtraction. Suppression now grows until at least
    TWO teams and at least k PEOPLE are hidden (two teams of 2 and 1 still
    leave a 3-person residual), absorbing publishable teams smallest-first; if
    the company cannot hide anything safely, no team detail is published.
  · **Exact small counts.** A suppressed team reported its exact size — one
    subtraction from the cell itself. Every suppressed team now reports the
    same band ceiling (k−1) and the dashboard renders "< k".
  · **Unsuppressed cells.** Per-dimension splits and trend points had no k test
    at all; a one-person cycle plotted that person at 0 % or 100 %. Both are
    now gated, and an outcome delta is withheld when the PREVIOUS cycle was
    unpublishable (or it leaks that cycle by subtraction).
  Also: a response with no dimension data was counted as 'low', quietly pulling
  company risk down — it is now excluded. `docs/DATA_MODEL.sql`'s `nr1_report()`
  is explicitly "illustrative" and still needs the same four rules; this file
  is its stated reference.
- **No error boundary existed anywhere.** React 18 unmounts the whole tree when
  a render throws, so any single bad component left a white screen with no way
  back — including mid-session, in a product people use to calm down. Added
  `components/ErrorBoundary.tsx` at the root, keyed on the route so navigating
  away clears it without a reload. The copy is calm and the stack trace is
  folded away (testers still need it, patients must not meet it).
- **Object-URL leaks in the TTS providers.** Both revoked only on `ended`, so
  every audition that was stopped or replaced mid-play leaked an entire mp3 —
  and repeated auditioning is exactly how the Studio is used. Released now on
  end, replace AND stop.
- **`exportWav` revoked its blob URL in the same tick as the click**, which can
  cancel the download; the other three download helpers already waited. Now
  consistent.
- `tools/test-nr1-anonymity.ts` (42 assertions) runs the attacks as tests,
  including a scan proving no respondent identifier appears anywhere in the
  payload. Checked separately that the demo population (121 respondents/cycle,
  6 teams) still publishes fully, so the POs see no regression — only People
  and Finance now read "< 5" instead of "4" and "3", which is the point.
- Verified clean and NOT changed: no XSS sinks anywhere (`dangerouslySetInnerHTML`,
  `eval`, `innerHTML` all absent); every AudioContext render path already closes
  in a `finally`; the immersive player already clears its interval on unmount;
  demo-mode auth carries no role, so localStorage tampering cannot escalate
  privilege, and it only runs when Supabase is absent.

**Slice: music clips play a PLAYLIST, not one song on loop** (current)
- PO report: in phase 4 "a song repeats itself on a single clip".
- Cause, exactly as described: `plainStudio` drew ONE file per music clip
  (`drawMusic`), and `buildSampleLayer` looped that single file until the clip
  window was full. Phase 4's window is minutes long and a song is ~3 min, so
  the same track audibly started again inside one clip. The `sample` track
  blurb even documented the looping — correct for a soundscape TEXTURE, wrong
  for a song.
- **Model**: `SampleParams.slots?: SampleSlot[]` (ordered, up to
  `MAX_SAMPLE_SLOTS = 5` — the POs asked for five gaps) plus `loop?: boolean`.
  `sampleSlots()` / `sampleLoops()` are the single resolvers so renderer,
  waveform and Inspector cannot disagree. Backward compatible: a clip with no
  `slots` is still just `url`, and `loop` defaults by inference — a clip
  carrying `drawPhase` is music and does NOT loop, so projects saved before
  this slice are fixed too.
- **Renderer**: `buildSampleLayer` takes the whole playlist and lays it out in
  sequence with equal-power (sin/cos) crossfades at the joins, cutting the last
  entry at the end of the clip. A soundscape still loops. If a playlist is
  shorter than its clip the SEQUENCE repeats rather than any single song, and
  the shortfall is surfaced instead of hidden.
- **Drawing**: `drawMusicPlaylist()` keeps drawing DISTINCT songs from the
  phase pool until the window is covered or the cap/pool runs out.
  `estimateAssetSeconds()` reads length from `sizeBytes` at an assumed
  192 kbps — deliberately a high bitrate, so the estimate runs SHORT and errs
  towards one song too many (harmless, the renderer cuts) rather than too few
  (a repeat). Both the import and the Studio's 🎲 redraw use it, and
  `projectLedger` now counts every slot so a redraw cannot hand back a song
  already queued elsewhere.
- **Studio**: `SamplePlaylist` in the Inspector — the five slots, each with its
  REAL decoded length (shared with the render cache, so the bar tells the truth
  rather than an estimate), a remove button, an add picker, and a fill meter
  reading green when the songs cover the clip, red with the missing time when
  they do not, amber when they overrun with a note that the last one is cut.
- `renderPlain` notes the shortfall per clip, naming the pool to add songs to.
- `tools/test-music-playlist.ts` (21 assertions): the loop policy per clip
  type, distinctness within a playlist and across clips, the 5-song cap, a
  one-file pool that must not queue the same song five times, an empty pool,
  and the size→seconds estimate.

**Slice: the male-voice distortion — a monitor with no peak protection**
(current)
- PO feedback after testing the previous slice: pronunciation and the
  mid-track voice changes are FIXED; the distortion remains, and only on male
  voices — with one decisive control, **the child male voice is fine**.
- That control is what solved it. Measured on the POs' own five voices (real
  ElevenLabs audio at 24 kHz, engine's own BS.1770 meter):

  | voice | crest | energy <160 Hz | peak @ −6 LUFS | PO |
  |---|---|---|---|---|
  | Child (M) | 13.1 dB | 12 % | +9.8 dBFS | fine |
  | Maternal (F) | 9.8 dB | 55 % | +7.2 dBFS | fine |
  | ASMR (M) | 11.9 dB | 70 % | +9.7 dBFS | distorts |
  | Paternal (M) | 8.6 dB | 92 % | +5.1 dBFS | distorts |

  Two hypotheses died here and are recorded so they are not retried: it is
  NOT headroom (the child voice needs the MOST, +9.8 dB, and is fine) and it
  is NOT the §9 limiter (THD 0.15 % at 110 Hz, inaudible; and Paternal comes
  out of mastering with −152 dB of non-gain residue, i.e. pure gain). The one
  column that orders exactly like the complaint is low-frequency content.
- **Root cause**: `calibrateBufferToDb` gives a clip whatever gain its
  protocol level demands, and at −6 LUFS that is +5…+10 dBFS with 12 000 to
  24 000 samples past full scale. Legitimate inside the engine — buffers are
  float and §9 brings the EXPORT back under −1 dBTP. But `MultitrackPlayer`
  wired master straight to `ctx.destination`, which hard-clips at ±1, so the
  Studio **monitor** was distorting audio that exports clean. Clipped bass
  buzzes; the child voice's clipping lands on sparse transients nobody hears.
- **Fix — monitor bus, two stages** (`MultitrackPlayer`): a
  DynamicsCompressor (−6 dBFS, ratio 10, 2 ms/200 ms) for level riding, then
  a WaveShaper soft-clip as a GUARANTEED ceiling, because a compressor's
  attack lets a transient 10 dB over through before the gain moves. The curve
  is exactly unity below −6 dBFS (ordinary monitoring bit-identical) and its
  endpoints stop at 0.87, so it cannot emit a sample at the rail whatever
  arrives. **Monitoring only** — exports and published audio go through
  `renderMixdownBuffer` + `masterizeBuffer`, not through here.
- `bufferPeakDb()` added; `renderPlain` now NOTES when a lane asks for a level
  it cannot physically hold, naming the track and the overshoot, and explains
  that the same voice/bed ratio is available without overload by lowering the
  other lanes — §9 normalises the finished mix to −16 LUFS either way, so what
  reaches the listener is the RATIO, not the absolute number.
- `tools/check-monitor-clipping.ts` (15 assertions): the old path clips, the
  new one emits zero rail samples, and the curve is unity below the knee.
  Deliberately does NOT assert that bass clipping is more audible — that is
  psychoacoustics, not something this file can measure.
- Still outstanding: `renderPlain.ts:145` and `renderDatasheet.ts:506` each
  have their OWN voice loop with a hardcoded `lang`, no request stitching and
  no block grouping. The Studio path has all three. Those two paths have not
  been brought in line.

**Slice: GL-ANX 1.1 voice cluster — language, identity, preview, §9 on
every output** (current)
- Diagnosed against the PO's own render (`GL-ANX_1.1_Deep(1) - Voce a
  -6LUFS.wav`, 44.1 kHz/16-bit, exactly 24:00) rather than by inspection.
- **Root cause of the accent/identity drift** (`src/tts/elevenlabs.ts`):
  the request carried only `text`, `model_id` and two voice settings, on
  the file's own stated assumption that the multilingual model "auto-
  detects the language from the text, so no language flag is needed".
  Language is inferred PER REQUEST and a protocol is one request per
  line, so short Italian fragments landed in the wrong language — "pace"
  read as the English word, "profumo dentro calma" with a Brazilian
  accent. `TtsOptions.lang` already existed and every caller passed
  `{lang:'it'}`; `fetchBytes` never read it. Now: `lang` honored,
  `stability` 0.5 → 0.8 with `use_speaker_boost` (0.5 is the loose end of
  the range — the same voice id came back as a different person),
  `style` pinned at 0, a deterministic FNV-1a `seed` (a session
  re-renders identically), and `previous_text`/`next_text` request
  stitching so a two-word fragment inherits the surrounding sentences.
- **`MODEL_CAPS` table**: `language_code` is a 422 on multilingual_v2 and
  is withheld there; `apply_text_normalization:'on'` is only requested
  when the language is ALSO enforced (expanding "1, 2, 3" into number
  words while the model still guesses the language is how a counting line
  counts in Portuguese). One constant (`MODEL_ID`) switches engine when
  the POs re-audition for turbo/flash/v3.
- **Ellipsis**: the PO hypothesis was right — nothing touched `…`.
  `shapeTtsText` maps U+2026 to the documented `...`, normalizes spacing,
  collapses doubled ellipses and adds terminal punctuation. Deliberately
  NOT `<break>` tags: the docs warn they make the model speed up or add
  artifacts.
- **Spoken language is now first-class** (`ttsLanguage()`, `VITE_TTS_LANG`)
  and deliberately NOT the UI locale — a therapist can browse in one
  language and render a protocol authored in another.
- **Preview** (`SoundStudio.tsx`): re-requested the API every time, so
  previewing a synthesized clip played a brand-new take — a different
  performance from the timeline's, and billed for it. A rendered clip is
  auditioned from its own `ttsSource` (no network, no charge), re-baked
  for pan/speed but without the protocol's calibration so a −34 LUFS
  whisper lane is still audible. New `ttsText` tracks staleness, since
  clearing `ttsSource` on a text edit would make the clip re-render as
  the placeholder TONE; the Inspector now asks for a re-synthesis instead.
  "↻ Re-synthesize" bumps the seed so it can escape a bad take.
- **Batch cache** keyed on the whole request, not on text alone — keying
  on text is what stamped ONE bad take onto all four repeats of a LOOP
  block.
- **§9 mastering reached only the PLAIN auto-render.** "⬇ Esporta WAV",
  publish and attach wrote the raw mixdown — no −16 LUFS normalization
  and no −1 dBTP limiter, on the copy patients stream. Measured in the
  reference file: −14.85 LUFS, and 35 777 samples pinned at full scale in
  L (7 945 runs of ≥2, longest 166 samples flat) for +0.18 dBTP. All
  three paths now go through `masterSessionBuffer`.
- **Binaural**: measured the hard-panned carrier pair across all 24 min —
  L 200.00/R 210.00 Hz (10.00 Hz beat) to ~11:56, then L 200.00/R 206.00
  Hz (6.00 Hz) to ~19:20, dead steady through the flagged 14:27–14:46 at
  up to 65 dB channel separation. The reported artifact is NOT in this
  render, matching the PO's inability to reproduce it. Mechanism found
  instead: overlapping clips on a pure-tone lane put both right-ear
  carriers in one ear, beating at the difference BETWEEN pairs (210 vs
  206 = a 4 Hz wobble belonging to neither). `plainStudio` now butt-joins
  those lanes — the predecessor is cut short, since each start is a phase
  boundary — and `plainTimeline` warns. Left a WARNING, not an error: an
  error blocks the import outright, and locking the POs out of their own
  workbook over a rounding overlap is worse than the artifact.
- **§9 ordering was ALSO wrong, and it mattered.** The old pass normalized
  to −16, limited against SAMPLE peaks, then turned the whole session down
  by up to 3 dB because inter-sample peaks were still over — so the ceiling
  decided the loudness. On the POs' file (voice deliberately at −6 LUFS,
  which they chose by ear) that landed at −18.50 LUFS, 2.5 LU under target,
  with the peaks paid for by every quiet passage equally. `limitBuffer` now
  takes a TRUE-peak envelope so it reduces gain only where a peak is, and
  the loudness limiting costs is added back and re-limited. Measured on the
  same file: **−16.08 LUFS / −1.00 dBTP, 71 549 clipped samples → 0**, with
  the limiter taking −0.00 dB in quiet passages and −0.38 dB on the hottest
  moment. The approved balance survives; only the peaks were capped.
  `measureTruePeakDb` gained an exact screening bound (|interp| ≤ L1 ×
  largest neighbour, checked on block maxima) — without it the iteration
  would have been ~9 billion multiply-adds per pass; the whole 24-min
  master now runs in ~35 s.
- **Verified against the live API**, not asserted (`tools/check-voice-drift.ts`
  — synthesizes each reported line old-vs-new and transcribes both with
  scribe_v1, so the detected LANGUAGE is a measurement):
  · 3:10 counting — OLD was spoken in **ENGLISH** ("One, two, three, four,
    five", eng p=0.79), worse than the "a little too fast" reported. NEW:
    "Uno, due, tre, quattro, cinque", ita p=0.85. **Fixed** — by the
    stitched context, not by normalization. 2.28 s for the five numbers.
  · "profumo dentro calma" — OLD actually said "**Profundo**" (a Portuguese
    word). NEW says "Profumo". Word fixed; the language label still leans
    pt for that phrase (p 0.36 → 0.26).
  · "pace" — OLD transcribed "**Taste**". NEW "Pace". Word fixed.
  · 8:12 and 9:10 measured ita p=0.99–1.00 BEFORE the fix, so those two
    complaints are NOT language errors — they are delivery. Unchanged here.
- **The model switch is a dead end, and now we know instead of guessing.**
  Isolated one-word whisper fragments came back 0/3 Italian across FIVE
  configurations — multilingual_v2 with short and with long stitching,
  turbo_v2_5 and flash_v2_5 both with `language_code=it`, and v3. v3 also
  400s on `previous_text`/`next_text` ("not yet supported"), i.e. adopting
  it would LOSE the stitching that fixed the counting line, and it produced
  outright garbage twice ("Peace.", "靠吗？"). Hard language enforcement does
  not rescue a one-word request.
- **The LOOP lane fix, now BUILT.** The residual drift is an architectural
  consequence of asking for one word at a time, so the Studio stops doing
  that. `TtsProvider.renderJoined()` speaks a block as ONE utterance and
  reports where each line landed; `SoundStudio.groupVoiceJobs()` batches
  ADJACENT short lines (≤34 chars, ≤4 words, ≤6 per block, same lane + voice
  + speed) and cuts the result apart with `sliceBuffer`. Long lines are left
  alone — a sentence already works and grouping it would only risk the cut.
  · ElevenLabs `/with-timestamps` returns character-level alignment that
    matches the sent text exactly (verified), so each line maps to a real
    time span. Each span is widened to the MIDPOINT of the silence between
    neighbours, so cuts land in the gap and not on a consonant, and the spans
    TILE the audio — no gap, no overlap, nothing discarded.
  · A missing or mismatched alignment REFUSES to cut rather than slicing
    mid-word.
  · `MODEL_CAPS` gained `timestamps` and `stitching`. v3 has neither, so the
    joined path degrades to per-line rendering instead of breaking on a model
    swap; stitching is now gated too, since v3 400s on previous_text.
  · One joined render serves every clip in the block AND every later repeat
    of it (`blockCache`), so an 8-minute ostinato costs ONE request and every
    cycle is identical.
  Verified live end-to-end: the block reads **ita p=0.96** where the same
  words alone were 0/3 Italian, and each line's spoken words fall inside its
  own slice (`tools/check-voice-drift.ts` now asserts this, comparing scribe
  word timings against the spans we cut). `tools/test-tts-block.ts` (19
  assertions) locks the span maths and the refuse-to-cut guards.
- `ClipShape` promoted to module scope (it was declared inside the component
  and the new job type needed it).
- The remaining content item: the counting line at 3:10 can be slowed with
  `velocita_wpm` in the sheet (a row with no wpm and modalità ≠ sussurrato
  resolves to ×1.00) now that it says the right words.
- `tools/test-tts-request.ts` (esbuild-bundled, 27 assertions): ellipsis
  shaping, stitching, seed determinism vs. context/language, explicit-seed
  reroll, rate clamping, `language_code` withheld, and a 422 that points
  at MODEL_CAPS. tsc + prod build clean; test-shape / test-mastering /
  test-bilateral-sound / test-library-plan / test-whisper-draws unchanged
  and passing. (`tools/test-wizard.ts` was already broken before this
  slice — it imports a non-existent `src/data/program`.)

**Slice: REF-xx parser + whisper-ostinato (triple stacking, mini-spec)**
- **Request A (parser)**: `set_affermazioni` now accepts a SINGLE ID
  alongside the unchanged CSI range grammar — `CSI-05` and `REF-01`
  resolve to one Affermazioni row (`^[A-Z]{2,4}-\d{2,}(\.\.\d{2,})?$`).
  REF-xx rows are flagged `refrain` and EXCLUDED from the clinical
  8⊂12⊂20 subset counts (mini-spec: "REF is not an affirmation"). Error
  message updated; all existing CSI ranges untouched, no file migration.
- **Request B (whisper-ostinato rendering)**: a Voice clip with
  tipo_contenuto=loop + modalità=sussurrato + single REF-xx set is
  expanded as the 3rd stacking layer: the refrain's "..."-separated
  fragments loop at a 5 s expiratory cadence + 9 s breathing silence =
  29 s cycle, DELIBERATELY offset from the 24 s affirmation interval (no
  rhythmic lock-in — 1 exact coincidence in the whole 8-min phase);
  whisper voice of the same Maternal figure, diffuse alternating ±15% pan
  (never dry-center), riverbero from the sheet; the last ~90 s stretches
  ×1.15 and drops a further −2.5 dB with ≥3 s fades so it dissolves into
  the 20:00 transition (no hard cut, no fragment crossing the phase end).
  Sidechain implemented as a new duck family `whisper` (−2.5 dB, 200/500
  ms) driven ONLY by main-voice windows (the ostinato never ducks anyone,
  and never masks the −16 LUFS anchor). [PROTOCOL] level honored:
  volume_lufs −28.
- Node-proven against the real Deep workbook (tools/test-plain-deep.ts):
  every §D acceptance criterion — 0 errors (109 clips), REF-01 → 1 row,
  CSI-01..20 → 20 rows, clinical Deep count = 20, whisper lane at −28
  LUFS with duck='whisper', 4 fragments, 29 s cycle, offset held, tail
  −30.5 LUFS with ≥3 s fades, nothing crosses 20:00. All eight prior
  proofs + build + tsc clean.

**Slice: direct Excel import + externally-mastered upload** (current)
- The "Import protocols" page is GONE. The catalog's "⬆ Import Excel"
  button now opens the file dialog directly; the workbook is probed and
  parsed on the spot (PLAIN Timeline only — anything else shows a one-line
  error next to the button) and lands straight on the minimal workscreen.
  The workscreen's own Import Excel button opens the same dialog, so
  re-importing a corrected file never leaves the screen.
- **The PO's mastering workflow is now first-class**: import the Excel →
  Edit in Studio → Download the WAV → masterize it OUTSIDE the app →
  🎧 Upload mastered (accepts WAV/MP3/FLAC/M4A, decoded and validated;
  a >20 s duration mismatch vs the protocol version is flagged) → Publish
  ships THAT exact file to the whole application (192 kbps streaming copy,
  same attach path), skipping the in-app render and the TTS-key
  requirement entirely. The action shows "Mastered ✓" once loaded, a
  status line names the file (+ "Use the app render instead" to clear it),
  and the Live confirmation records which file went out. Without an
  upload, Publish renders in-app as before.
- Action row is now five: Import Excel · Edit in Studio · Download ·
  Upload mastered · Publish.
- `tsc` + `npm run build` clean; all eight node proofs pass (PLAIN,
  studio seed, pools, shape, mastering, LUFS workbook, wizard/program,
  scheduling).

**Slice: patient ↔ therapist scheduling** (current)
- **Patient journey** (PO spec, verbatim): the home's therapist card became
  "Schedule a session" → popup listing the company's APPROVED therapists
  (same-company first; pilot fallback to all approved) with their profile
  pictures → picking one shows their OPEN times (weekly agenda expanded to
  the next 14 days, minus booked slots, minus the past) grouped per day →
  picking a time books it (double-booking rejected by a DB unique
  constraint with a friendly "just taken" message + refreshed slots) →
  confirmation screen. The home then shows the appointment card (with
  Cancel booking); from 5 MINUTES BEFORE the start until the end, it turns
  into a big "Enter session" button that launches the ordinary session
  flow (the person's current program protocol) — "o fluxo de sessão
  prevalece".
- **Therapist journey**: new 🗓 Agenda screen (topbar) — a weekly grid
  (Mon–Sun × 07:00–19:00) where the therapist toggles the hours they are
  available; each toggle saves immediately and those are EXACTLY the hours
  patients can book. Booked visits list underneath and never re-open.
  5 minutes before a session, a banner appears above the roster ("Session
  with <name> at HH:MM — the patient sees their Enter button now") with
  "Start session →", which finds-or-creates the roster patient linked to
  the booker's B2C profile (consent row included, same as the request
  queue) and opens the patient card — the existing clinical session flow
  takes over from there.
- **Data**: `therapist_availability` (weekly template jsonb) +
  `appointments` (unique therapist+time; status booked/cancelled/done)
  with RLS — availability readable by the signed-in, writable by its
  owner; appointments visible to the two involved, insert by the patient,
  update by either. Provider (Supabase + mock) gains ten scheduling
  methods; 30-second polling keeps both sides fresh (no realtime infra
  needed).
- Node-proven slot math: template → concrete openings (weekday+hour only,
  4 openings for 2 slots × 2 weeks, same-day future kept, booked and past
  excluded); the join window opens exactly 5 min before and closes at the
  end. SQL fresh + idempotent on Postgres 16 (both tables present). `tsc`
  + build clean; all proofs pass; B2C strings translated (it + pt).

**Slice: simplified protocol workscreen (admin)** (current)
- The PLAIN screen after the catalog list is now MINIMAL, per PO feedback:
  one identity line (code · title · duration/clips · published/live badge)
  and FOUR large actions — Import Excel · Edit in Studio · Publish ·
  Download. All the old cards (review, phases, tracks, affirmations,
  publish form, render options) are gone.
- **Publish is the whole pipeline in one press**: catalog entry (with the
  full timeline; existing audio/blurb preserved) → offline render with
  voice → 192 kbps upload & attach → "Live ✓". A single status line
  narrates progress; errors show as one line with the fix spelled out
  (missing SQL columns → run setup.sql; missing voice key → opens
  Details).
- **Download** renders the same full WAV locally. **Edit in Studio** seeds
  and navigates straight there (no notes screen in between). Version chips
  appear only when a workbook carries more than one sheet.
- Everything technical moved behind a collapsed "Details": the ElevenLabs
  key panel, workbook warnings/infos, seeding + render notes. Workbook
  ERRORS still block the actions and list compactly. The pool-loading gate
  and Retry stay. Catalog button relabeled "⬆ Import Excel".
- `tsc` + `npm run build` clean; all proofs pass (logic unchanged — UI
  only, plus Publish now chains the existing publish/render/attach calls).

**Slice: profile pictures for every user** (current)
- New shared `src/components/AvatarUpload.tsx`, placed on all four
  surfaces: B2C Profile (52 px, replaces the 🙂), therapist topbar (34 px,
  replaces the emoji avatar), employer topbar (32 px) and the admin
  sidebar footer (30 px). Clicking the picture opens the OS image picker;
  the photo is CENTER-CROPPED square and resized to 512 px JPEG in the
  browser (canvas, quality 0.86) before upload — a 12 MB phone photo
  becomes a ~60 kB avatar. Busy state, inline error, ✎ badge affordance;
  `readOnly` mode available for future display-only spots.
- Storage & data: new public `avatars` bucket with OWN-FOLDER RLS — every
  signed-in user may write only `<their auth uid>/…`, everyone may read;
  `profiles.avatar_url` column (defensive alter) updated on upload with a
  cache-busted public URL. Provider gains `getMyAvatarUrl` / `setMyAvatar`
  (Supabase + mock — mock keeps a local data-URL so demo mode works
  offline). setup.sql re-validated on Postgres 16, fresh + idempotent.
- `tsc` + `npm run build` clean; all proofs pass.

**Slice: B2C composer removed + the protocol project (auto progression)**
(current)
- "Compose your own" is GONE from the B2C app: the home card, the composer
  screen state and its launch path are removed — an employee can never
  build their own audio. The SessionComposer itself stays available in the
  THERAPIST portal (clinical tool), untouched.
- **The protocol project** (`src/data/program.ts`): the wizard's answers
  now create the person's whole family pathway, not just one session.
  Entry protocol = the wizard's primary; the pathway ascends through the
  family and wraps to cover all five sub-protocols exactly once (entry
  GL-ANX 1.3 → 1.3, 1.4, 1.5, 1.1, 1.2 — per the innovation doc's sequence
  model, collapsed to per-session steps for the self-guided B2C; the
  Phase-2 therapist pathway keeps its own clinical pacing). Finishing the
  program's current session ADVANCES it: 1.1 → next session is 1.2, and so
  on. Repeat/Explore sessions never advance the path. State in
  localStorage (`gl.program`), duration = the wizard's Q4 answer.
- Home screen: with a path running, the big CTA becomes "Continue your
  path — <protocol> · session N of 5 · Xm"; a "Feeling different? Check in
  again" card re-runs the wizard (restarting the path from today's
  answers); the "Didn't resonate?" card (shown after session 1) now
  RESTARTS the path from the spec's alternative protocol. Path complete →
  the CTA invites a fresh check-in. Onboarding starts the program too.
- Note on "the 1-minute placeholder audio": that is the dev-bar demo
  toggle (demo · 1 min) and/or a protocol whose audio isn't published yet
  — only GL-ANX 1.1 has attached audio today. As each protocol's PLAIN
  file is imported + rendered + attached in the admin, the same program
  sessions automatically stream the real files (registry hydration).
- Node proofs: pathway construction (entry 1.3 wrap, 2.1 straight, 4.5
  wrap, all codes resolve) added to test-wizard — ALL PASS; all seven
  prior proofs pass; `tsc` + `npm run build` clean.

**Fix: onboarding uses the new wizard** (current)
- The screenshot'd emoji screen was the OLD MicroIntake inside the
  first-run onboarding — the main app already opened the new wizard, but a
  first-time user never saw it. Onboarding now runs: Welcome → LGPD
  consent (kept as its own explicit step, RN-LGPD-02 — it used to live
  inside MicroIntake) → the SAME 3–4 question SessionWizard → stereo check
  → the chosen protocol at the chosen duration (the fixed 6-min WOW
  constraint is gone — the wizard's duration answer is respected) →
  post-session VAS.
- The wizard's 1–10 intensity doubles as the hidden pre-session VAS
  (high intensity = low mood face; maintenance reads as feeling well), so
  the post-session delta keeps working without the emoji question.
- The wizard's alternative is stored from onboarding too ("didn't
  resonate?" card appears on the home right after the first session).
- `tsc` + build clean; wizard routing proof still ALL PASS.

**Slice: B2C session wizard (3–4 questions, PO spec)** (current)
- New `src/data/wizard.ts` (routing data, verbatim from the spec, pure +
  node-tested) and `src/screens/SessionWizard.tsx`:
  Q1 PINPOINT — 7 feeling clusters; "I'm tired" opens the dedicated
  clarification (Burnout / Depression / Stress); MAINTENANCE skips the
  scale AND the clarify and goes straight to duration.
  Q2 SCALE — 1–10 tap grid (skipped for maintenance).
  Q3 CLARIFY — the five per-cluster tables with PRIMARY + ALTERNATIVE
  protocol per row, including the spec's cross-family fallbacks
  (RESIL 5.3 → DEP 2.2, RESIL 5.4 → DEP 2.3).
  Q4 DURATION — 6 / 12 (highlighted "recommended") / 24.
  Back navigation + progress dots throughout.
- Home screen: the big "Start session" CTA now opens the wizard; "same as
  last time" became a Repeat card underneath. The wizard's ALTERNATIVE
  ("if the primary does not resonate after listening") is remembered and
  surfaced as a "Didn't resonate?" card after the session, replacing the
  generic daily recommendation while present.
- Static protocol registry expanded from 6 to ALL 25 protocols with the
  spec's titles (published imports still override at runtime); GL-ANX 1.1
  title aligned to the spec ("Calm and Inner Security"). Unpublished
  protocols play the placeholder bed with the existing note — honest until
  their audio is attached.
- MAINTENANCE assumption flagged to the POs: the spec defines no
  maintenance protocol; routed to GL-RESIL 5.5 (Vision and Continuous
  Growth) with 5.3 as alternative — one-line change when they decide.
- Wizard fully translated (it + pt dictionaries, ~55 strings each);
  protocol titles remain the catalog's clinical names.
- Node proof `tools/test-wizard.ts`: all 25 registry codes, every spec
  table row (primary + alternative) byte-exact, tired → burnout/
  depression/stress, maintenance resolves, cross-family links present.
  `tsc` + `npm run build` clean; all seven audio/parser proofs still pass.

**Fix: Studio faders read LUFS** (current)
- PLAIN lanes now carry their authored loudness target (`baseLufs` on the
  seed → track), and the Studio fader reads/edits in LUFS — the protocol's
  own mix language: VOX-C shows "−16.0 LUFS" at neutral, MUS-1 "−22.0",
  BIN-1 "−25.0"; dragging to −22 attenuates exactly 6 dB; type-in ("-22")
  and scroll (±0.5 LU) work in LUFS; range −60…−6 LUFS, bottom = mute.
  Legacy volume_db sheets read in LUFS too (anchor-referenced). Manual /
  non-PLAIN tracks keep the dB fader. Internally nothing changed —
  `track.volume` stays linear gain, engine/mixdown untouched.
- Proven on the PO's LUFS workbook: baseLufs −16 / −22 / −22 / −25 on the
  respective lanes; all prior proofs pass. `tsc` + build clean.

**Slice: volume_lufs — absolute per-clip LUFS targets (PO's new Excel)**
(current)
- The PO re-encoded the level column exactly as the loudness doc's
  "absolute" alternative: `volume_db` → `volume_lufs`, an ABSOLUTE
  per-clip integrated-LUFS target (voice guide −16 = mix anchor, never
  ducked; VOX-R −22; soundscapes −22/−28/−36; music −34 under the bed /
  −22 foreground; binaural −25 solo / −34 layered; solfeggio −30;
  bilateral −28 — README §6/§8 of the workbook).
- Parser: per-sheet `levelMode` detection ('lufs' when the volume_lufs
  header is present, 'offset' for legacy volume_db sheets — BOTH keep
  working). LUFS validation: positive value = error (targets live below
  0), > −6 warning (hot vs the −16 anchor), < −60 warning. Type defaults
  for empty cells follow the README §6 map. `eco_volume_db` and
  `attenuazione_ciclo_db` stay RELATIVE dB (FX), per the workbook's own
  note.
- Seeder: in LUFS mode every clip is input-normalized to its ABSOLUTE
  target (engine unchanged — calibrate offset = lufs − ANCHOR_LUFS) and
  every fader sits at neutral 0.0 dB: the sheet IS the mix, the fader is a
  pure user offset. Legacy offset sheets keep the fader-ladder behavior.
  Inspector now shows the absolute target ("input-normalized to −34.0
  LUFS"). Ducking, crossfades, EQ, draw pools, §9 output mastering all
  unchanged.
- Proven on the PO's real file (tools/test-plain-lufs.ts): mode detected,
  71 clips, 0 errors, all faders 1.0, VOX-C −16 / VOX-R −22 / MUS −34×2 +
  −22×4 / SS-1 −22/−22/−36 coda / BIN −25 & −34 / loop 12×−16, crossfades
  and duck families intact. Legacy PLAIN file still passes all five
  existing proofs (offset mode untouched). `tsc` + `npm run build` clean.

**Slice: PO loudness pipeline (rev. 3) — LUFS input normalization**
(current)
- Implements the PO's specified pipeline verbatim, in order:
  (1) pinned metric: integrated LUFS (BS.1770), voice = 0 dB = the
  ANCHOR_LUFS (−23) — every volume_db in the Excel is an offset vs it;
  (2+3) INPUT normalization per source: every clip buffer is measured in
  integrated LUFS (K-weighted, gated — voice pauses / faded beds don't skew
  it) and scaled with ONE uniform gain to anchor + its Excel offset, so the
  sheet's number produces the intended relationship whatever the source
  file / synth / TTS take measured (this was the missing step the PO's doc
  identified); (4) §8.3 ducking on Music/Soundscape under active voice
  (already in place); (5) mix-bus sum (unchanged); (6) OUTPUT normalization
  ONCE on the final mix to −16 LUFS (§9 mastering, already in place —
  uniform gain, ratios intact; explicitly NOT per clip, which is the
  classic bug the doc warns about — our per-clip step is
  normalize-to-anchor-plus-offset, never normalize-to-equal); (7) true-peak
  limiter at −1 dBTP on the final mix (already in place).
- Mechanics: `calibrateBufferToDb` reimplemented on integrated LUFS
  (measureLufs shared with the mastering module), ±30 dB sanity clamp,
  gated-RMS fallback only for clips shorter than a BS.1770 block (0.4 s).
  Processing order per clip stays EQ → input normalization → fades. The
  mixer keeps reading the protocol: lane fader = the lane's Excel dB, clip
  normalized to (its dB − lane base) → fader × clip = anchor + Excel dB.
  Fader range stays −60…+12 dB. The Studio and the offline render share the
  same call — identical loudness.
- Excel encoding note (flagged to the POs): current sheets keep working
  as-is — the column reads as an OFFSET vs the anchor (voice 0), exactly
  the doc's steps 1–3. If the POs later re-encode the column as absolute
  per-track LUFS targets (the doc's alternative), it's a one-line change
  (target = value instead of anchor + value).
- Node-proven: a hot synth (−0.4 LUFS) lands at −32.0 LUFS for a −9
  offset; a quiet source is boosted to −41.0 for −18; two sources with
  wildly different intrinsic loudness end EXACTLY 12.0 LU apart for −6 vs
  −18; an EQ'd clip still lands on target (normalization after EQ); seed
  expectations updated (targets 0/0/−14, −12×2, 0/−9, guide anchored).
  `tsc` + `npm run build` clean; all five proofs pass.

**Slice: real-dB level model (PO decision, rev. 2)** (current)
- The loudness-calibration relationship is REMOVED from the PLAIN path:
  `volume_db` in the Excel is now a REAL dB value applied directly as gain
  (10^(dB/20)) — no RMS measurement, no voice-reference anchoring. The POs
  author their source files at known levels upstream, so the sheet IS the
  mix. Lane fader = the lane's loudest clip's dB; quieter clips on the same
  lane carry the difference as a plain baked gain offset (applyClipShape).
  `calibrateDb` stays in the engine (unused by the seeder) — nothing else
  changed: fades, crossfades, EQ, ducking, §9 mastering, draw pools and the
  pool-draw gate/late-draw fix from the previous slice all stay as they are.
- Fader range widened for real-dB work: −60 … +12 dB (was −40 … +6), same
  dB taper, readout/typing/scroll unchanged.
- Inspector's "from the protocol Excel" note reworded (clip level vs the
  track fader; no calibration wording).
- Verified: `tsc --noEmit` + `npm run build` clean; all five node proofs
  pass with the updated real-dB expectations (SS-1 fader −6 dB with the
  −14 dB baked coda, MUS −12×2, BIN clip 2 −9, guide gain 1.0, clips
  untouched, zero calibrateDb anywhere in the seed).

**Fix: silent "no pool available" clips — gate + late draw** (current)
- Root cause: the tag/phase file DRAW happens at seed/render time, but
  "Open in Sound Studio" and "Render WAV" were clickable while the asset
  library was still LOADING (or after it failed) — clicking fast produced a
  fully seeded project whose Music/Soundscape clips all said "no pool
  available" and stayed silent.
- Gate: both buttons now disable with a "Loading library…" label until the
  pools resolve; a failed load shows the error inline with a Retry button;
  mock mode keeps its explicit silent-lanes note.
- Rescue for already-seeded projects: sample clips now carry their DRAW
  INTENT (`drawTag` / `drawPhase` on SampleParams, set by the seeder), and
  the Studio's sample Inspector gains "🎲 Draw from pool" (per clip — also
  usable as a deliberate re-roll on a drawn clip) and "Draw ALL missing"
  (fills every silent sample clip in the project in one click, reporting
  how many were filled and which pools are genuinely empty). Pools are
  fetched lazily and shared with the existing file-picker cache.
- Verified: `tsc --noEmit` + `npm run build` clean; all five node proofs
  pass.

**Slice: clip equalizer + audio-delivery revalidation** (current)
- **Per-clip parametric EQ** (`multitrack.ts` engine + Inspector panel):
  the standard studio 6-band layout — Low cut (HPF) · Low shelf · two Bells
  · High shelf · High cut (LPF) — RBJ-cookbook biquads applied OFFLINE to
  the clip's rendered buffer. Every band: on/off, log frequency slider with
  type-in ("250", "2.5k"), ±18 dB gain, Q 0.3–8 on the bells; live
  frequency-response curve (the curve math is proven equal to the audio
  path); Reset. Processing order is EQ → loudness calibration → fades, so
  shaping a clip's tone NEVER moves it off its protocol layer level — carve
  mud out of a bed and it still sits at exactly its Excel dB. Baked into
  the buffer: playback, waveform, cut/glue and the WAV export all hear it;
  changes re-render debounced (170 ms, existing pipeline). Frozen (cut)
  pieces show a lock note. Node-proven: +12 dB bell @1 kHz boosts a 1 kHz
  tone 12.0 dB and leaves 100 Hz at 0.08 dB; a 200 Hz low cut drops 50 Hz
  by −24 dB and passes 2 kHz at 0.00 dB; curve = audio (12.0 dB @1 kHz);
  EQ'd clip still lands at −9 dB layer level.
- **Audio delivery revalidated end-to-end** (render → DB → B2C/therapist):
  the chain was already sound — attach uploads the 192 kbps MP3, writes
  `versions.audioUrl['pt-BR']` + `audio_ready` on the protocol row; every
  surface hydrates the runtime registry from the DB on load
  (DataLayerProvider → listProtocols → registerProtocols), and both the
  B2C SessionRunner/Onboarding and the therapist MonitoredSession resolve
  `version.audioUrl['pt-BR']`; RLS lets any signed-in user read protocols
  and the audio bucket. ONE real bug found and fixed: re-publishing (e.g.
  after re-importing a revised Excel) rebuilt `versions` from the workbook
  and DROPPED the attached audioUrl, silently detaching the streaming file
  — publish now carries existing audioUrls over per duration. Known
  cosmetic limit: hydration is async, so a deep link opened in the very
  first second of a fresh session may briefly resolve the static entry.

**Slice: real crossfades + the Excel ladder ON the faders** (current)
- **Crossfades existed only on paper**: the PLAIN workbook writes ABUTTING
  clip times and hands the transition to `crossfade_prec_s` (6–8 s on the
  GL-ANX 1.1 beds) — which was parsed but never applied, so every
  soundscape/music handover was a hard cut. Now a sample clip with
  crossfade X starts X s EARLY (duration extended, same end) with an X-s
  fade-in while its predecessor gains the matching X-s fade-out — real
  overlapping handovers on the same lane, reported per lane in the seed
  notes. Node-proven on the real file: SS-1 clip 2 starts 6 s early
  overlapping clip 1, every MUS-1 phase boundary overlaps (5 crossfades).
- **Equal-power fades everywhere**: `applyClipShape` ramps are now sin/cos
  (equal-power) instead of linear — crossfading two beds keeps constant
  perceived level instead of the −3 dB mid-dip, and every fade_in/fade_out
  from the Excel sounds smoother. (Numeric proof updated: half-fade point =
  0.707 × gain.)
- **The mixer now READS the protocol**: lane base dB moved from inside the
  clips onto the FADER — voice sits at 0.0 dB, VOX-R at −6, BIN-1 at −9,
  music at −6, Pioggia at −20 … exactly the Excel layer selector, visible
  and absolute. Clips stay loudness-calibrated to their lane base (offset 0
  for most; a −20 dB coda on a −6 dB lane carries −14), so fader dB ×
  calibrated clip = the Excel's volume_db, measured. Guide fader gain 1.0;
  all previous behavior for manual/legacy tracks unchanged.
- Verified: `tsc --noEmit` + `npm run build` clean; all five node proofs
  pass with updated expectations (fader −6 = 0.501, BIN 0.355, guide 1.0;
  offsets 0/0/−14, −12×2; overlap + fade assertions).

**Slice: audible layer separation — loudness-calibrated ladder + dB faders**
(current)
- Root cause of "moving a fader changes nothing / everything is mashed":
  (1) the Excel's volume_db was applied as FADER gain while the sources
  have wildly different intrinsic loudness (full-scale synth binaural vs
  −18 LUFS library music vs TTS voice), so the ladder never actually
  existed in the audio; (2) the fader itself was a LINEAR 0–1 slider, where
  most of the audible range lives crushed in the bottom millimeters.
- **Loudness-calibrated ladder** (`multitrack.ts`: `gatedRms`,
  `calibrateBufferToDb`, `shapeClipBuffer`, `VOICE_REF_RMS = 0.13`): every
  PLAIN clip buffer is now MEASURED after render and scaled so its gated
  RMS (silence-proof — voice pauses and faded beds don't skew it) lands at
  exactly its volume_db below the guide-voice reference. A −18 dB music
  clip is measurably 18 dB under the voice regardless of how hot the source
  file, synth or TTS take was — the Excel column is a real layer selector
  now. New `calibrateDb` rides SeedClip → Studio Clip through every buffer
  path (doRender, rebakeVoice, ♪ Synthesize, All voices) and the offline
  renderer (same shared call — Studio and WAV hear the same clip). Loop
  cycle attenuation folds into calibrateDb. Inspector shows "layer level
  −18 dB vs the guide voice (loudness-calibrated)".
- **Faders at house unity** — the ladder lives in the clips, so every lane
  seeds at 0.8 and any fader movement is a pure dB offset on a correct mix.
  Seed notes list each lane's layer level.
- **dB audio-taper faders** — the track volume slider now runs in dB
  (−40…+6, 0 = −∞): equal slider travel = equal audible change anywhere on
  the range; readout and click-to-type are in dB (e.g. "-12"); scroll =
  ±0.5 dB. `track.volume` stays linear internally — engine, seeds and
  mixdown untouched. (Live gain updates during playback were already wired
  via setTargetAtTime and now have a taper worth hearing.)
- Verified: `tsc --noEmit` + `npm run build` clean; all five node proofs
  pass, including new numeric calibration checks (hot synth → −9 dB lands
  at 0.0461 RMS exactly; quiet source ×2.07 up to −18 dB; gated RMS
  silence-proof; calibrate+fade compose) and updated seed expectations
  (unity faders, calibrateDb ladder −6/−20, −18×2+−6×4, −9/−18, guide 0).

**Slice: §9 mastering · desktop-first admin · catalog = the workspace**
(current)
- **Mastering (Rules §9)** — `src/studio/mastering.ts`, applied as the final
  pass of every PLAIN render: integrated loudness measured per ITU-R
  BS.1770-4 (K-weighting biquads computed for the real sample rate, 400 ms
  blocks / 75 % overlap, −70 LUFS absolute + −10 LU relative gating) →
  normalized to the −16 LUFS session target (two protocols now leave at the
  SAME perceived volume) → true-peak limiter at −1.0 dBTP (4× oversampled
  sinc peak detection, 5 ms lookahead, 200 ms release) + a final measured
  verification trim so even pathological transients respect the ceiling.
  The render note reports the whole chain (pre LUFS, gain, post LUFS, dBTP,
  limiter depth). The <70 dB SPL ceiling is a device-volume property and is
  documented in the note; −16 LUFS sits comfortably under it at normal
  settings. Node-proven: mono FS 997 Hz sine −3.05 LUFS (canonical −3.01),
  K-weighting shape (100 Hz reads low, 8 kHz ~+4 LU), 0.5-amp sine −6.02
  dBTP, quiet session +18 dB → −16.00 LUFS, hot session −15 dB → −16.00
  LUFS, injected square spike limited to exactly −1.00 dBTP.
- **Desktop-first admin** — the console is an internal desktop tool: the
  sidebar is now position:fixed to the left edge (always visible, its own
  scroll), the workspace flows beside it (max-width 1400 px), and on small
  windows the console KEEPS the desktop layout (min-width 1024 px,
  horizontal scroll) instead of collapsing into a mobile arrangement. The
  B2C app stays mobile-first — untouched.
- **Catalog = the workspace, no re-imports** — a protocol imported in the
  PLAIN format reopens its FULL workscreen (review → Studio → render →
  attach) by clicking its catalog row; the timeline lives on the catalog
  entry (`protocols.plain`). PlainImport now detects an already-published
  code on mount, so nothing asks to be published twice. Every row gains a
  ✕ Delete (confirm dialog; audio files in storage are kept), backed by the
  NEW `deleteProtocol` provider method (Supabase + mock).
- **Catalog cleaned** — setup.sql no longer seeds the 5 demo protocols and
  now DELETES any existing `source='seed'` rows (imported protocols are
  never touched). The catalog is admin-curated: only what you import lives
  in it. SQL re-validated (fresh + idempotent; 0 rows after cleanup).
- Verified: `tsc --noEmit` + `npm run build` clean; ALL FIVE node proofs
  pass (parser, studio seed, pools/draw/duck, clip shape, mastering).

**Fix: schema-cache reload + 90 s preview removed**
- Publish error "Could not find the 'plain' column of 'protocols' in the
  schema cache": the column exists after running setup.sql, but Supabase's
  PostgREST layer caches the schema and can serve the stale one. setup.sql
  now ends with `notify pgrst, 'reload schema';` — running it both adds the
  columns AND reloads the API cache in one shot. Re-run the updated
  supabase/setup.sql in the Supabase SQL editor, then press Publish again
  (no project restart needed). SQL re-validated on Postgres 16 (fresh +
  idempotent).
- 90 s preview mode REMOVED per PO decision: the render is always the full
  session; the preview checkbox, the `_preview90s` filename suffix and the
  attach preview-guard are gone (`renderPlain.ts`, `PlainImport.tsx`).
- Verified: `tsc --noEmit` + `npm run build` clean; all four node proofs
  (parser, studio seed, pools/draw/duck, clip shape) re-run: ALL PASS.

**Slice: PLAIN render = Studio mixdown · tag/phase pools + random draw
(slice 3)**
- `src/admin/assetPools.ts`: pool model + random draw per the Rules doc
  §7.1–7.2. "Sensible migration" — NO files move: Music phase pools = the
  existing GLOBAL `assets/music/f1…f6` folders; Soundscape tag pools = the
  `assets/soundscape/<texture>` folders + filename tokens, matched to the
  Italian `ambiente` text by an it/en/pt synonym dictionary ("lago calmo" →
  lake, "vento leggero" → wind, "pioggia dolce" → rain); heartbeat ambiente
  → the `assets/heartbeat` pool (Dec. H). POs can add extra draw tags per
  file WITHOUT moving it via the NEW `asset_meta` table (path → tags[]),
  edited inline on soundscape rows in the Asset Library (saved on blur).
  Draws use a seeded RNG (mulberry32): reproducible when the seed is fixed,
  fresh per render otherwise; every draw is reported ("SS-001 drew
  calm-01.mp3 — tag "lago calmo" → 2 candidates").
- `plainToStudioTracks` now takes `{ pools, seed }`: sample clips get the
  drawn file's URL + label (empty pool → silent + note), so "Open in Sound
  Studio" plays the real files; lanes carry a NEW `duck` family marker
  (music / soundscape / none — heartbeat = none).
- `src/admin/renderPlain.ts`: the WAV IS the Studio mixdown — the render
  seeds the SAME project the Studio opens and mixes it through the SAME
  `renderClipBuffer` + `renderMixdownBuffer` + shared FX chain; voice clips
  are ElevenLabs-rendered per clip voiceId (cached per voice+text), baked
  with `bakeVoiceBuffer` + `applyClipShape`. On top, the app-side §8.3
  DUCKING: Music −10 dB / Soundscape −6 dB under active voice, attack
  200 ms / release 500 ms, computed from the voice-clip WINDOWS (no
  detector needed — we know the timeline); voice, entrainment and heartbeat
  never duck. Implemented as a NEW optional `gainAutomation` on `MixTrack`
  (a second gain node — the Studio's own export path is untouched). 90 s
  preview supported.
- PlainImport is now the full vertical: review → seed Studio → Publish
  (CatalogProtocol with the full timeline in the NEW `protocols.plain`
  jsonb column — re-renderable from catalog data; existing
  spec/datasheet/assetMap on the same code are preserved) → Render WAV
  (version chips, preview + voice toggles, VoiceEnginePanel, live progress,
  draw + ducking notes) → Download / Upload & attach (192 kbps MP3 via the
  shared attach path — the exact file that streams in the employee app).
  Attach requires a published protocol and a FULL render.
- `supabase/setup.sql`: adds `protocols.plain` (+ defensive alter) and the
  `asset_meta` table with RLS (read: signed-in; write: admins). Validated
  against a real Postgres 16 (auth schema + roles stubbed): clean on a
  FRESH database and idempotent on a second run; columns + policies
  verified present.
- Verified: `tsc --noEmit` + `npm run build` clean; node proof
  `tools/test-plain-pools.ts` (esbuild-bundled) → synonym mapping, pools
  (f1×2/f3×1, 5 soundscapes, 1 heartbeat), draws ("lago calmo"→lake,
  heartbeat→heartbeat pool, asset_meta tag "fabbrica" reaches its file,
  empty pool→null), seeded reproducibility, duck envelope math (attack
  10.0→10.2 s to −10 dB, release 20.0→20.5 s back to 1, window merging),
  and the pools-integrated seed on the real GL-ANX 1.1 (SS-1 lake URLs,
  MUS F1/F3 drawn + 4 silent phases, duck families, identical draws for
  identical seeds). Slice-1 and slice-2 proofs re-run: ALL PASS.
- Notes: a re-render draws fresh files BY DESIGN (the Rules doc's session
  variability); fix the seed for reproducibility. Loudness normalization /
  true-peak / <70 dB SPL ceiling (§9) stay on the Renderer-v3 backlog.

**Slice: PLAIN → Sound Studio seeding, 1 row = 1 clip (slice 2)**
- `src/admin/plainStudio.ts`: `plainToStudioTracks()` seeds the Studio from a
  parsed PLAIN version — every Excel row becomes exactly ONE clip on a track
  named from `traccia`, in file order. Binaural → carrier (L+R)/2 + beat
  R−L; Solfeggio → binaural clip with beat 0 (house convention); Bilateral →
  intervallo/blip + NEW `panAmp` param (pan_ampiezza/100, engine honors it);
  Soundscape/Music → silent SAMPLE lanes labeled with the tag / phase pool
  (slice 3 wires the random draw). Voice: archetipo+modalità → catalog voice
  (Dec. 6: sussurrato prefers a same-gender Whisper voice — Paterna
  sussurrata → Thomas); riverbero_pct → track Reverb; velocità wpm → ×speed
  (130 wpm baseline, noted); hard-L/R tracks get the track CHANNEL with clip
  pan 0.
- Two documented lane splits keep row↔clip 1:1 while respecting track-level
  FX: linea clips with eco=on ride "<traccia> · eco" (Emotional Echo
  pre-enabled, delay/mix from eco_ritardo/eco_volume); a loop clip expands
  on "<traccia> · loop (<set>)" — one clip per affirmation per cycle at
  `intervallo` spacing, `attenuazione_ciclo` dB per cycle, 1s/2s default
  envelope per the Rules doc, echo/reverb inherited. Every seeding decision
  is returned as a note and shown in the review screen.
- Volume model: guide voice 0 dB ≙ fader 0.8; each track's fader = its
  LOUDEST clip's nominal dB; per-clip differences ride NEW `Clip.gainDb` +
  Excel `fade_in/fade_out`, baked into the clip's rendered buffer by
  `applyClipShape()` (multitrack.ts) — waveform, realtime playback, cut/glue
  and WAV mixdown all see the same shaped audio, zero scheduler changes.
  Applied across doRender, rebakeVoice, ♪ Synthesize and "All voices";
  Inspector shows a read-only "from the protocol Excel" line on shaped clips.
- **Bug fix:** the Studio voice ▶ Preview now speaks with the CLIP's voice
  (voiceId passed through to the TTS provider) instead of the default.
- PlainImport review screen: "Open in Sound Studio →" per version (disabled
  while errors exist) seeds the project, lists the seeding decisions, then a
  second click navigates — nothing is hidden behind the tab switch.
- Verified: `tsc --noEmit` + `npm run build` clean; node proofs
  (esbuild-bundled): `tools/test-plain-studio.ts` against the real GL-ANX
  1.1 → 13 tracks / 82 clips (70 rows + 12 loop expansions), SS-1 fader
  −6 dB with the −14 dB coda offset, MUS-1 −6 dB with two −12 dB F1–F2
  offsets, BIN-1 205/10 Hz + −9 dB second clip, SOL-1 432 Hz beat 0, BIL-1
  400 Hz·4 s·panAmp 1.0, VOX-C 33 clips Valeria + Reverb 30%, loop 12 clips
  @20 s with echo −8 dB/+2 s, VOX-L/R channels L/R, eco lane VR-009/010,
  Dec. 6 voice matrix; `tools/test-shape.ts` → applyClipShape gain/fade math
  numerically exact, no-op passthrough returns the original buffer; slice-1
  parser test still ALL PASS.
- Next slice: render = Studio mixdown; Asset Library tags + phase pools
  (Supabase migration from f1–f6) + random draw filling the sample lanes.

**Slice: PLAIN Timeline importer + validation (slice 1 of the clip-level
format)**
- NEW recommended import path per the "Rules for Good Loop protocols" doc
  (Dec. A–H, §5–§8): `src/admin/plainTimeline.ts` parses the README /
  per-version clip grids / Affermazioni workbook — one row = one clip, six
  track types (Soundscape · Music · Binaural · Bilateral · Solfeggio ·
  Voice), all 36 columns typed. Numeric `start_s`/`end_s` are authoritative;
  `m:ss` cells are cross-checked only. Banner + TOTALE/DURATA footer rows
  skipped; Binaural beat derived (carrier_R − carrier_L); loop sets
  (`CSI-01..12`) resolved against the Affermazioni sheet in `ordine_loop`
  order. The 3 extra Affermazioni columns (`ordine_loop`, `bilaterale_lato`,
  `eco_keyword`) are kept and flagged to POs via an info issue.
- Validation per the Rules doc: required fields per type, pan −100..+100,
  `crossfade_prec_s` only on Soundscape/Music, same-track overlaps beyond
  their crossfade, Binaural XOR Solfeggio (error, binding §8.5 r.5), §8.0
  phase-window warnings (Binaural in F3–F4, Solfeggio in F4, Bilateral
  outside F4), loop-fits-window check, declared TOTALE/DURATA cross-checks,
  8 ⊂ 12 ⊂ 20 subset sanity. Retired concepts (breathing pacer, key/BPM
  metadata, synth beds) simply don't exist in the vocabulary; heartbeat is a
  Soundscape clip with an "heartbeat" ambiente (Dec. H, info note).
- Import hub: `.xlsx` files are probed for the PLAIN shape FIRST (header row
  with clip_id/traccia/tipo/start_s/end_s — legacy Scheda Dati/Unica can't
  match it) and routed to the new `PlainImport.tsx` review screen: identity,
  per-version phase map + duration, tracks with clip counts per type, the
  affirmation database, and all issues by severity. The formats panel now
  shows PLAIN as the ⭐ recommended card (full-width); Scheda Unica and the
  multi-sheet workbook remain fully supported and unchanged.
- Verified: `tsc --noEmit` + `npm run build` clean; node proof
  (`tools/test-plain.ts`, esbuild-bundled) against the real
  `GL-ANX_1_1_Standard_12min_Timeline_PLAIN.xlsx`: 71 clips (7 SS · 6 MU ·
  2 BI · 1 BIL · 1 SOL · 54 VC) on 11 tracks, 6 README phases (F4 =
  5:30–9:30), BI-001 200/210 → 10 Hz, VC-019 loop → 12 ordered CSI IDs,
  12 affirmations with the extra columns, 0 errors/warnings, garbage bytes
  rejected.
- Next slices: Studio seeding 1:1 (+ clip-voice Preview fix), render =
  Studio mixdown, Asset Library tags + phase pools with random draw.

**Fix: voice tracks — function first, side second**
- Regression fixed: ECO/SUSSURRO rows on L/R (e.g. GL-ANX 1.2's right-side
  whispers) were being absorbed into the RIGHT track at 72% volume, deleting
  the echo lane. Now the split is by FUNCTION first: "Voice — guide" and
  "Voice — echo & whisper" (32%, side kept as clip pan) ALWAYS exist;
  "Voice — LEFT/RIGHT" appear for the version's principal dichotic VOCE/LOOP
  rows only. Verified via node seed test on 1.2 (6/12 min).

**Fix: Studio v2 corrections (PO feedback)**
- **L/R visible**: dichotic rows now seed onto dedicated "Voice — LEFT" /
  "Voice — RIGHT" tracks with the track CHANNEL set (clip pan 0 — the track
  positions the side); fine pans (L25) stay per-clip on the guide track.
  CORO rows get their own "Voice — CORO (refrain)" track with the Harmonizer
  PRE-ENABLED (seed now carries channel + effects).
- **Honest percents**: the Solfeggio track volume equals the doc's percent
  (528 Hz al 15% → 15%), via DsMix.solfeggioPct.
- **Session fades present**: ### MIX fade in/out (defaults 2 s/3 s) ride the
  master in Export WAV and Attach (mixdown gain ramps); the live transport
  stays un-faded for editing.
- **No more synth music/soundscape ANYWHERE**: the Studio seeds only the
  library sample tracks (empty "map files in the Asset Library" lanes when
  unmapped), and Renderer v3 plays only mapped f1–f6 files — unmapped phases
  are silent with an explicit note. synthPad/texture fallbacks deleted; the
  excel's MUSICA section is metadata only (validation message softened).
  Bowl/heartbeat synth provisionals stay until the PO files arrive.

**Slice: Studio v2 + audio polish**
- **Per-row voices reach the Studio**: datasheetToStudioTracks rebuilds the
  voice tracks straight from the datasheet rows — every clip carries its OWN
  voiceId (row Voce → catalog; [M] → protocol secondary; default otherwise),
  fine pan (L25 etc.) and speed. "Synthesize all" now speaks each line with
  its right voice (this was the "all audios have the same voice" bug — the
  old seed dropped the voice column).
- **v2 layers visible in the Studio**: binaural CURVE seeded as per-phase
  clips (e.g. 10 Hz → 7 Hz → 10 Hz, editable clip by clip); "Solfeggio N Hz"
  track (binaural clip with beat 0 = pure tone both channels); "Breathing
  pacer" track with breath clips per RESPIRAZIONE row (rate derived from the
  pattern timings).
- **Audio polish ("sounds weird")**: breathing pacer rebuilt — darker
  breath-like band (300–480 Hz + low-pass 900), eased swell envelopes, level
  −18→−24 dB (was reading as wind static); solfeggio now a pure sine (the
  triangle's harmonics clashed with the music bed), capped at −14 dB
  regardless of the doc percentage; continuous whisper now follows the
  datasheet's [M] voice (was the engine secondary).

**Slice: Scheda Unica v2 — the 7 gaps closed**
Pattern analysis across ALL 8 Italian protocols + the 9 in-depth technique
docs ("112 techniques 9 tools") drove a format+engine upgrade:
- **Binaural curve per phase**: FASI gains a Binaural column ("Theta 7 Hz
  (rampa 90 s)") — the renderer ramps the beat per phase and back (curves
  like Alpha 10→Theta 7→Alpha 10 now render as documented). Legacy Deep
  Theta transition still works when no curve is declared.
- **### MIX section**: per-protocol music/soundscape/binaural offsets,
  solfeggio layer (432/528/396 Hz continuous, % or dB), tipo battimento
  binaural/ISOCRONICO (amplitude-pulsed carrier — works without headphones),
  phase crossfade, session fades, eco loop vs eco dicotico (delay+gain),
  whisper gain, bilateral volume % + blip ms. All optional; engine defaults
  otherwise.
- **### RESPIRAZIONE**: guided breathing pacer rows (pattern catalog:
  Sospiro Fisiologico, 4-7-8, Coerente 5-5/6-6, Box, 4-4-6[-2], Cyclic
  Sighing, or any numeric sequence) — rendered as band-passed air swells
  (rising inhale / falling exhale) at −18 dB in the declared phase.
- **TIMELINE v2**: columns matched BY HEADER (order-independent); Canale
  accepts fine pans (L25/R40); optional Effetto (CORO = harmonized chorus on
  that row, ECO = extra delayed copy) and Velocità (pitch-preserving speed)
  columns.
- **### TECNICHE / ### NOTE**: documentary sections preserved verbatim on
  the protocol and summarized in the review screen ('#' ids no longer eaten
  by the comment rule — only '//' comments).
- **Admin UI**: import hub explains both accepted formats (Scheda Unica
  recommended card + legacy multi-sheet); review screen shows v2 facts
  (voices, curve, solfeggio, isochronic, breathing, MIX) and preserved
  sections. Sign-out buttons get a solid contrasting background
  (b2b-btn--signout) in admin + employer.
- Deliverables: GL_Scheda_UNICA_TEMPLATE.xlsx (v2, guided) and
  GL-STRESS-4_3_Scheda_UNICA.xlsx (flagship example: curve, MIX per the doc,
  8 breathing rows, CORO refrain at 10:00, Cornelio as [M] wise voice) —
  both validated through the shipped parser with zero issues.

**Slice: single-tab datasheet ("Scheda Unica") + per-row voices**
- `datasheet.ts` — new SINGLE-TAB import format: one sheet, sections marked by
  `### NAME` rows (PROTOCOLLO · PARAMETRI · VERSIONI · FASI · TIMELINE ·
  AFFERMAZIONI · MUSICA), `//` comment rows ignored. The TIMELINE section is
  unified (Versione column instead of three sheets), has NO Fase column
  (derived from the FASI windows by time), and its Voce column accepts a
  catalog voice NAME, an archetype word, or F/M. AFFERMAZIONI gains Versioni
  ("6,12,24") and per-affirmation Voce columns. PROTOCOLLO block carries
  "Voce predefinita" / "Voce [M] predefinita". Multi-sheet workbooks still
  import unchanged (shared finishValidation). Stub rows (only Versione+Tempo
  filled) are skipped, not flagged.
- `renderDatasheet.ts` — per-row voice resolution, most specific wins:
  row Voce → affirmation Voce → protocol defaults → Invarianti archetype →
  engine defaults (Valeria/Marco). Render notes list row-level voices used
  and warn on names that don't match the catalog.
- Deliverables: GL_Scheda_UNICA_TEMPLATE.xlsx (guided template) and
  GL-ANX-1_3_Scheda_UNICA.xlsx (real example, validated: 43/57/86 timeline
  rows, defaults Valeria/Marco Trox, 8 named-voice rows, zero issues).

**Fix: type-exact values + time scrubbing**
- **Every numeric value is click-to-type**: the shown value (dashed underline)
  on Inspector sliders, track volume %, and all FX params becomes an input on
  click — type "83", "0.83", "83%", "-6 dB", comma decimals; Enter/blur
  commits, Esc cancels; clamped to the param range ("%"/bare-number shorthand
  on 0..1 params).
- **Time**: the current-time readout in the top bar is click-to-type
  ("3:45" or plain seconds) and the RULER now scrubs — press and DRAG to
  slide the playhead (pointer-captured). While playing, the playhead follows
  instantly and the transport restart is debounced (90 ms) so scrubbing
  doesn't stutter.

**Slice: track effects (FX chain)**
- New `src/studio/effects.ts` — five effects, PO list included:
  · HARMONIZER (Coral/Multiple voice): pitch-shifted copies (resample + WSOLA
    stretch-back, duration preserved) layered around the original with stereo
    spread + optional octave layer → one voice reads as a chorus. Processed
    OFFLINE per clip, cached per source+params; clips play their harmonized
    buffer transparently (fxBuffer) in transport and mixdown.
  · EMOTIONAL ECHO: delay + feedback with warm low-pass on repeats.
  · REVERB: convolver with generated exponential-decay impulse (cached IRs).
  · SATURATION: soft tanh waveshaping, warmth → distortion by drive.
  · FILTER: low/high-pass tone shaping.
- ONE chain builder serves the realtime player AND the offline mixdown
  (identical nodes) — editing sound == exported sound. Chain order:
  harmonized clips → saturation → filter → echo → reverb → gain → pan.
- UI: FX button on every track header (active-count badge) → drawer with
  metadata-driven cards (enable + sliders per effect). Effects apply LIVE
  during playback via the hot-swap (signature includes the FX chain).
- MixTrack/SchedTrack carry `effects`; Track model + attach/export wired.

**Fix: Italian default · voice migration + datasheet voice spec · volume UX**
- **Default locale = Italian** (`src/i18n`): the env override (VITE_DEFAULT_LOCALE)
  still wins; the fallback was ''en''. Users who previously picked a language
  keep their saved choice (localStorage) — switch once in the selector.
- **Legacy voice migration**: saved voice ids that are NOT in the PO catalog
  (e.g. the old male primary) are treated as unset → Valeria/Marco take over
  automatically, in the provider AND in the panel preselects. No user action.
- **Datasheet voice specification**: the Invarianti rows "Voce primaria /
  secondaria" now RESOLVE to catalog voices by explicit name ("Valeria") or
  archetype keyword (materna/paterna/sussurrata/saggio/neutra/guerriero/
  ombra/rituale/bambino, it·en·pt, [F]/[M] gender filter). Renderer v3 uses
  them per row; unspecified → engine defaults. Render notes state which
  voices were used and why.
- **Track volume UX**: dedicated full-width volume row per track header
  (lane height 86→104), 0.5% slider steps, mouse-wheel ±1% fine adjust,
  live % readout.

**Slice: PO voice catalog baked in (no more voice IDs)**
- New `src/tts/voiceCatalog.ts`: the definitive PO list — 9 archetypes
  (Maternal, Paternal, Wise/Mentor, Neutral, Warrior, Shadow, Ritual,
  Interior Kid, Intimate/Whispered), 17 named ElevenLabs voices with their
  ids. Defaults: Valeria (F · Maternal) = the standard engine voice;
  Marco Trox (M · Paternal) = the [M] Deep double-induction voice.
- Voice Engine panel rewritten: API key + two catalog dropdowns grouped by
  archetype — NO voice-ID fields, no "Load voices". Key alone is enough;
  voices default from the catalog (settings/env stay backward compatible).
- Studio per-clip Voice picker now offers the built-in catalog by archetype
  (replaces the account-roster mechanism).
- CORAL/MULTIPLE (Harmonizer) and EMOTIONAL ECHO are documented in the
  catalog module as EFFECTS (roadmap; the engine's −8 dB/+2 s echo stacking
  already covers Emotional Echo's core behavior).

**Slice: playback audit · voice roster · in-Studio asset picker**
- **Real audio everywhere (audit)**: confirmed by architecture — the data
  provider hydrates the shared protocol registry from the catalog at startup
  (provider.tsx), every picker reads that registry, and all three players
  (B2C SessionRunner, ImmersivePlayer, therapist MonitoredSession) play
  `version.audioUrl['pt-BR']` when attached, placeholder otherwise. Attaching
  audio in admin makes it selectable and playable on every surface.
- **Voice roster (9 PO voices)**: 🎙 → Load voices now SAVES the account's
  voice roster (localStorage). Every voice clip's inspector gains a Voice
  dropdown: Default (engine voice) + the roster. Changing a rendered clip's
  voice clears its TTS take (a different voice = a new render — ♪ or
  "All voices" picks it up); pan/speed keep re-baking instantly. voiceId flows
  through TtsOptions → ElevenLabs (explicit voiceId > secondary > primary),
  and "Synthesize all" caches per voice+line.
- **In-Studio asset picker**: sample clips' inspector now browses the whole
  library (music grouped by phase, soundscapes by texture) and swaps THIS
  clip's file on pick — the protocol's per-phase default mapping stays in the
  Asset Library, as before. ＋ Track → "Audio file" + picker = free-form
  library clips anywhere.

**Fix: Studio layout + cross-track clip drag**
- **Toolbar** no longer clips off-screen: it wraps to a second row when
  narrow; proper `.mt-tbtn--wide` class replaces the oversized ad-hoc buttons
  ("♪ All voices", "✂ Cut", "🩹 Glue" now single-line, compact); project-name
  field yields space; tighter master/time groups; disabled states dimmed.
- **Track headers** widened (236→254 px) so M · S · L/C/R · volume · ＋ sit
  comfortably in one row.
- **Cross-track clip drag**: while moving a clip, dragging it up or down into
  another lane of the SAME track type carries it over (e.g. a guide voice clip
  down to "Voice — echo & whisper"); works for every type, live during
  playback, selection follows the clip. Different-type lanes reject the hop.
  Bottom hint documents it.

**Fix: pitch-preserving voice speed**
- New `src/studio/timestretch.ts`: native WSOLA time-stretch (40 ms Hann
  frames, 50% overlap-add, waveform-similarity alignment on the mono mix,
  same offsets applied to both channels). `bakeVoiceBuffer` stretches the TTS
  source instead of using playbackRate — the ×0.7–×1.4 voice speed slider now
  changes speed WITHOUT changing pitch.
- Validated numerically: output duration exact at every rate, pitch drift
  ≤ 0.02% (zero-crossing rate), amplitude preserved; worst case (8 s line at
  ×0.7) stretches in ~160 ms — still effectively instant in the UI.

**Slice: Studio editing overhaul (PO feedback)**
- **Live editing** — the transport now HOT-SWAPS while playing: any parameter
  re-render, drag, cut/glue, or synthesized voice landing reschedules playback
  at the current playhead, so volume/frequency/pan edits are audible
  immediately (previously sources were scheduled once at play, making every
  edit seem broken until stop/play).
- **Track channel L/C/R** — every track header has an L·C·R selector; the whole
  track is stereo-positioned live and in the mixdown/attach (per-clip voice pan
  still available on top for fine placement). New StereoPanner per track in
  MultitrackPlayer + pan in MixTrack.
- **✂ Cut** — splits the selected clip at the playhead into two pieces by
  SLICING the rendered buffer (periodic layers stay phase-continuous; TTS
  voices stay intact — no re-render). Pieces are "frozen": movable and
  re-cuttable, param/length edits blocked with a hint.
- **🩹 Glue** — merges the selected clip with the next clip on its track into
  one frozen clip; any gap becomes silence inside it (guard at 60 s).
- **Voice speed** — ×0.7–×1.4 slider; re-bakes the rendered voice instantly
  from its TTS source (no new API call), clip length follows the voice. Pan
  edits on rendered voices likewise re-bake instantly.
- Player/mixdown now honor clip durationSec (start(when, offset, duration)) so
  cut/trimmed clips can never overhang their timeline length.

**Fix: overall mix loudness + Studio batch voice synthesis**
- `renderDatasheet.ts` — **master makeup gain**: soft TTS voices (measured ref
  RMS 0.060 in the field) dragged the WHOLE mix down, since every layer follows
  the measured voice. The master now lifts the mix so the voice lands near
  −17 dBFS; all documented layer offsets ride along unchanged (binaural bed
  back at proper presence). New render note lists every psychoacoustic layer
  of the version with its state ("bilateral OFF by design" for 6-min etc.) so
  what was scheduled is auditable at a glance.
- `SoundStudio.tsx` — **"♪ Synthesize all voices"** in the top bar: renders
  every voice clip that has text and no voice yet, sequentially, one TTS call
  per unique line (cached), with progress and per-clip error reporting.

**Fix: music asset listing (flat layouts)**
- `assets.ts` — the music lister accepted ONLY the `assets/music/f1..f6/`
  folder layout, while soundscapes tolerated flat files too. Flat music files
  (`assets/music/f1_track.mp3` or unprefixed) were invisible → unmappable →
  synth-only music in renders AND in the Studio while soundscapes worked.
  Music now also lists flat files (phase from the `f1_`/`f2-` name prefix;
  unprefixed files appear in a "No phase prefix" group, selectable for any
  phase). `AssetLibrary.tsx` shows that group and clearer empty-state hints.

**Fix: silent music/soundscape in v3 renders + real assets in the Studio**
- `renderDatasheet.ts` — v3.1 **loudness-measured gain staging**: the PO files
  are already normalized (music −18 LUFS, soundscapes −24 LUFS) and the fixed
  "−18/−20 dB vs voice" gains attenuated them a second time (≈ −36/−46 dBFS —
  inaudible). The renderer now measures the RMS of every decoded asset and of
  the rendered voice and gains each layer to its documented offset relative to
  the MEASURED voice loudness (binaural and file-based heartbeat/bowl too).
  Also: spec-compliant curve automation (no events coincident with
  setValueCurveAtTime ranges — undefined/throwing behavior across browsers).
- `DatasheetImport.tsx` — the render (and publish) now re-reads the protocol's
  saved assetMap right before running, so mapping assets in the Asset Library
  AFTER importing takes effect without re-importing; publish never clobbers a
  saved mapping with undefined.
- **Studio real audio**: new `sample` clip type in `multitrack.ts` (plays a
  real library file, looped to clip length, fetched+decoded once per URL, with
  waveforms and realtime playback like any clip). `datasheetToStudioTracks`
  in `specStudio.ts` seeds Music/Soundscape SAMPLE tracks per mapped phase
  (synth kept only for unmapped gaps); "Edit in Studio" on a datasheet uses it
  with the freshest mapping. Voice clips still synthesize per clip via the ♪
  button (existing Studio behavior). A failed file fetch renders the clip
  silent with a "load failed" label instead of crashing.

**Fix: publish hang in the importers**
- `DatasheetImport.tsx` / `SpecImport.tsx`: `publish()` and `markReady()` had
  no error handling — any `saveProtocol` failure (most commonly the database
  missing the new `protocols.datasheet` / `asset_map` columns because the
  updated `supabase/setup.sql` hadn't been run) left the button stuck on
  "Publishing…" forever. Both now catch, reset `busy`, and show the error
  inline with an actionable hint (run setup.sql / sign in as admin). A failed
  audit write no longer blocks the flow after a successful save.

**Slice: Secondary [M] voice (Deep double-induction)**
- `src/tts/settings.ts` — optional `voiceIdSecondary` in the saved keys
  (backwards-compatible with existing localStorage).
- `src/tts/types.ts` — `TtsOptions.voice: 'primary' | 'secondary'` +
  `TtsProvider.hasSecondaryVoice`.
- `src/tts/elevenlabs.ts` — routes `voice: 'secondary'` to the [M] Voice ID,
  falls back to primary when unset.
- `src/tts/index.ts` — settings-first, env fallback `VITE_ELEVENLABS_VOICE_ID_M`.
- `src/tts/VoiceEnginePanel.tsx` — second Voice ID field (dropdown after
  "Load voices"), "▶ Test M" button (Italian double-induction line), F+M badge.
- `src/admin/renderDatasheet.ts` — [M] jobs (Storia B rows, `Voce = M`) render
  with the secondary voice; per-voice TTS cache; render notes now say whether
  the male voice was used or fell back.
- `.env.example` — documents `VITE_ELEVENLABS_VOICE_ID_M`.
Verified: `tsc --noEmit` + `npm run build` clean; no callers outside `src/tts`
touch the changed signatures.


**Slice: Asset Library · Datasheet Importer · Renderer v3** (current)

## What this slice adds
1. **Asset Library** (admin → Asset library): browses the PO's produced audio in
   `protocol-audio/assets` — music by phase F1–F6, soundscape loop textures by
   type, heartbeat/bowl once delivered — with in-place preview, and a per-protocol
   **phase → asset mapping** (music stem + soundscape texture per phase, plus
   heartbeat and singing-bowl file pickers) saved on the catalog entry
   (`protocols.asset_map`).
2. **Datasheet Importer** (admin → Protocol catalog → Import → pick the .xlsx):
   parses the Protocol Datasheet workbook (GL-ANX 1.3 format — Protocollo,
   Invarianti, Versioni, Fasi, Timeline_6/12/24min, Affermazioni, MappaMusicale,
   Asset, LayerEngine), validates with explicit issues, publishes the datasheet +
   a derived legacy spec to the catalog (`protocols.datasheet`). Timelines still
   "DA COMPILARE" import fine and are flagged **timeline pending**.
3. **Renderer v3** (`renderDatasheet.ts`): executes the datasheet with the real
   assets — music stems per phase per MappaMusicale with equal-power crossfades
   at phase boundaries and loop seams; looping soundscape textures; NEW heartbeat
   layer (60 BPM sub-audio lub-dub, −24/−20 dB, F2–F4; synth until the PO file is
   mapped); NEW singing-bowl layer (synth inharmonic strike; timeline BOWL rows +
   "Transizioni / F3 ogni 30 s" schedule); per-version affirmation fades
   (1.0/2.0 · 1.5/2.5 · 1.5/3.0 s); REC sub-sets per version; 600 Hz/100 ms
   bilateral (every 4 s Std / 3 s Deep, loop phase); Deep-only Theta 6 Hz in F4
   and dichotic/double-induction fallback when a timeline lacks L/R rows.
   Session streaming copies now encode at **192 kbps** MP3 (was 128).

## New / rewritten files
`src/admin/{assets.ts, AssetLibrary.tsx, datasheet.ts, DatasheetImport.tsx,
renderDatasheet.ts}` (new) · `src/admin/{AdminApp.tsx, ImportProtocol.tsx,
attachAudio.ts}` · `src/data/{catalog.ts, supabase.ts}` · `supabase/setup.sql`
(adds `protocols.datasheet` + `protocols.asset_map`; also fixes the protocol
column alters running before `create table protocols` on a fresh database) ·
`src/index.css` · new dependency: `xlsx` (lazy-loaded only when a workbook is
parsed — split into its own chunk).

## Verified
- `tsc --noEmit` clean; `npm run build` clean (xlsx code-split, 429 kB own chunk).
- Parser run against the real `GL-ANX-1_3_Scheda_Dati_Protocollo_1.xlsx`:
  all three version columns parse exactly (loop 12/20/24 s, fades 1.0/2.0 ·
  1.5/2.5 · 1.5/3.0, REC ×8/12/20, stacking none/echo/triple, bilateral
  600 Hz/4 s · /3 s @100 ms, heartbeat −24/−20 dB F2–F4, whisper −12 dB F4,
  dichotic 15×4 / 12×8 / 12×16 DI, Theta 6 Hz F4); 6-min timeline → 43 rows →
  35 voice jobs incl. 11 loop-faded + 3 repeats at −3 dB; bowl strikes at 0:02
  and 5:55; 12/24-min correctly flagged timeline-pending.
- `supabase/setup.sql` validated against a real Postgres 16: clean on a FRESH
  database and idempotent on a second run; all four catalog columns present.

## Renderer v3 flow (admin)
1. Asset library → pick the protocol → assign a music stem + soundscape per
   phase (+ heartbeat/bowl files when the PO delivers) → Save.
2. Protocol catalog → Import → the datasheet .xlsx → review → Publish.
3. Render stage: pick a version (pending timelines are disabled), 90 s preview
   or full, voice on (ElevenLabs, Italian) → Render WAV (v3) → Upload & attach
   (192 kbps MP3) → the exact file streams in the employee app + monitored
   sessions.

## Still pending after this slice
- Timeline_12min / Timeline_24min conversion into the datasheet (workbook side).
- PO deliverables: singing-bowl + heartbeat files (drop into
  `assets/bowl` / `assets/heartbeat`, then map them — the synth provisionals
  swap out automatically), music license confirmation.
- Remaining protocol docs → datasheets.
- Second (male) TTS voice for the Deep double-induction rows — currently
  rendered with the primary voice and flagged in the render notes.
