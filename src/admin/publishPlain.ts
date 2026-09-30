/* ============================================================================
   Good Loop — what publishing a PLAIN workbook writes to the catalog

   Lifted out of `PlainImport` so the rule can be executed and asserted rather
   than argued about. It is the one piece of logic that decides whether, after
   an import, the Studio can reopen that time signature — and it has to hold
   the hard rule from CLAUDE.md at the same time:

     publishing or editing ONE time signature must never disturb the others,
     their timeline, their Studio session or their attached audio.

   So: the incoming workbook's durations are MERGED into whatever the catalog
   already holds, each in its own slot, and every field that belongs to another
   duration is carried through untouched.
   ============================================================================ */

import {
  CATALOG_DURATIONS,
  catalogDuration,
  mergeVersions,
  narrowTimeline,
  timelinesByDuration,
  type CatalogProtocol,
} from '../data/catalog'
import type { Duration, ProtocolFamily, SessionPhase } from '../types/domain'
import { scriptIssues, type PlainAffirmation, type PlainClip, type PlainTimeline, type PlainVersion } from './plainTimeline'
import { SCRIPT_LANGS, langsWithText, textIn, type ScriptLang, type TextByLang } from '../tts/voiceLang'

const FAMILIES: ProtocolFamily[] = ['GL-ANX', 'GL-DEP', 'GL-BURN', 'GL-STRESS', 'GL-RESIL']

export function familyFromCode(code: string | null): ProtocolFamily {
  const fam = (code ?? '').split(/\s+/)[0] as ProtocolFamily
  return FAMILIES.includes(fam) ? fam : 'GL-ANX'
}

export function phasesForCatalog(v: PlainVersion | undefined): SessionPhase[] {
  if (!v || v.phases.length !== 6) return []
  return v.phases.map((p) => ({
    id: p.fase as SessionPhase['id'],
    name: p.label,
    fraction: Math.max(0.01, (p.endS - p.startS) / Math.max(1, v.durationS)),
    showOrb: p.fase === 2,
  }))
}

export interface PublishInput {
  /** The workbook on screen. */
  timeline: PlainTimeline
  /** The catalog row as it stands, if the protocol is already known. */
  existing: CatalogProtocol | undefined
  /** The time signature the screen is working on, when one is selected. */
  selected?: Duration | null
  /**
   * Write the workbook WITHOUT activating the protocol.
   *
   * Attaching an imported Excel is not publishing it. A PO importing a file so
   * they can work on it in the Studio has rendered nothing yet, and a protocol
   * that goes live the moment a spreadsheet is read would put an unfinished
   * session in front of a person.
   */
  keepDraft?: boolean
  /**
   * File this workbook under the protocol that is already open, keeping ITS
   * code and title.
   *
   * A protocol is created by hand now — code, clinical title, public name,
   * tags — and then workbooks are imported into it. Letting the spreadsheet
   * rename the thing it was imported into undid that, and a workbook whose
   * README names a different protocol filed the timeline under a code nobody
   * asked for. The Excel supplies the TIMELINE; the protocol supplies its own
   * identity.
   */
  intoExisting?: boolean
  /**
   * What the incoming timeline may do to a duration that already has one.
   *
   *   'import'  (default) an Excel just read: the SELECTED duration is merged
   *             into the stored one (`mergeScripts` — structure from the file,
   *             texts added, never removed); any other duration in the file is
   *             written only where the protocol has nothing yet.
   *   'keep'    the workscreen writing back what it already shows (Publish,
   *             opening the Studio): a stored timeline is never rewritten.
   *             The screen's copy is `mergedPlain()` — every duration folded
   *             into one, with ONE duration's affirmations — so writing it back
   *             could only ever lose something.
   */
  mode?: 'import' | 'keep'
  now?: number
}

/**
 * The catalog entry to write.
 *
 * Two invariants, both asserted in `tools/test-publish-plain.ts`:
 *
 * · Every duration the catalog already had still has its timeline afterwards,
 *   byte for byte, unless this workbook carries that duration too AND it is
 *   the one being imported — and then only ADDED to (`mergeScripts`).
 * · Every duration this workbook writes can be read back with `plainFor`,
 *   which is what the Studio reopens through. A publish that cannot be
 *   reopened is the failure this whole file exists to make impossible.
 */
export function entryForPublish({ timeline: t, existing, selected, keepDraft, intoExisting, mode = 'import', now = Date.now() }: PublishInput): CatalogProtocol {
  const code = intoExisting ? existing?.code ?? t.code : t.code
  if (!code) throw new Error('Il file non ha un codice GL (foglio README) — serve per pubblicare.')

  const phased = t.versions.find((v) => v.phases.length === 6) ?? t.versions[0]

  /* What was already published, then this workbook's durations on top — the
     ones the rules allow (`planPlainImport`). `timelinesByDuration` also splits
     the legacy `plain` field, so a row written before per-duration storage
     existed is carried forward rather than lost on the next publish. */
  const plan = planPlainImport({ timeline: t, existing, selected, mode })
  const incoming = plan.written
  const durations = CATALOG_DURATIONS.filter((d) => !!incoming[d])
  const plainByDuration = { ...timelinesByDuration(existing), ...incoming }

  const catalogPhases = phasesForCatalog(phased)

  return {
    ...(existing ?? {}),
    code,
    family: existing?.family ?? familyFromCode(code),
    title: intoExisting && existing?.title ? existing.title : (t.title ?? code).trim(),
    blurb: existing?.blurb ?? '',
    phases: catalogPhases.length ? catalogPhases : existing?.phases ?? [],
    /* With no sheet at all — an audio-only protocol, where a file is uploaded
       against a time signature and no Excel exists yet — the duration is the
       one the operator SELECTED, not a hardcoded 12. Falling back to 12 wrote
       the file into the wrong slot and left the chosen one empty. */
    versions: mergeVersions(existing?.versions, durations.length ? durations : (selected ? [selected] : [12])),
    enabled: keepDraft ? existing?.enabled ?? false : true,
    source: 'imported',
    tenants: existing?.tenants ?? 'all',
    audioReady: existing?.audioReady ?? false,
    spec: existing?.spec,
    datasheet: existing?.datasheet,
    /* Legacy mirror, kept only for readers that predate per-duration storage.
       `plainByDuration` is the authority and every reader in the app goes
       through `mergedPlain()` / `plainFor()`. */
    /* Never overwrite the legacy mirror with an EMPTY timeline. A protocol
       whose only material is an uploaded audio has no sheets to mirror, and
       writing `t` here would blank a legacy `plain` that may still be the only
       home of a duration written before per-duration storage existed. */
    plain: durations.length ? (incoming[selected ?? durations[0]] ?? incoming[durations[0]]) : existing?.plain,
    plainByDuration,
    assetMap: existing?.assetMap,
    updatedAt: now,
  }
}

/* ============================================ import = compare, then add ==

   An Excel imported into a protocol that already has work in it ADDS to that
   work. It used to replace it: the duration's whole timeline was swapped for
   the file's, so re-importing last month's Italian-only workbook wiped the
   Portuguese text written since — and, because every duration in the file was
   written whatever chip was selected, a 6-minute file imported with the 12m
   chip on overwrote the 6-minute version nobody was looking at.

   The rules, from the owner:

     · STRUCTURE and PARAMETERS come from the file: which clips exist, their
       timing, levels, fx, archetipo, phases. The file is the score.
     · TEXT is merged per language. A language the file lacks, or a clip /
       affirmation it leaves empty, keeps the stored text. Clips are matched by
       `clip_id`, affirmations by `id`.
     · Only the SELECTED duration is written. Another duration in the same
       file is written only when the protocol has no timeline for it yet.
     · Studio sessions, audio, names, tags and cover are never touched: they
       are not in this function's reach, and `entryForPublish` spreads them. */

/** Every language's text of a clip, tolerating timelines stored before
    `testoByLang` existed (only `testo`, Italian). */
function clipScript(c: Pick<PlainClip, 'testo' | 'testoByLang'> | undefined): TextByLang | undefined {
  if (!c) return undefined
  return c.testoByLang ?? (c.testo ? { it: c.testo } : undefined)
}
function affScript(a: Pick<PlainAffirmation, 'testo' | 'testoByLang'> | undefined): TextByLang | undefined {
  if (!a) return undefined
  return a.testoByLang ?? (a.testo ? { it: a.testo } : undefined)
}

/** Stored text first, the file's non-empty text over it. */
function mergeText(stored: TextByLang | undefined, incoming: TextByLang | undefined, kept: Partial<Record<ScriptLang, number>>): TextByLang | undefined {
  const out: TextByLang = {}
  for (const l of SCRIPT_LANGS) {
    const inc = textIn(incoming, l)
    const old = textIn(stored, l)
    if (inc) out[l] = inc
    else if (old) { out[l] = old; kept[l] = (kept[l] ?? 0) + 1 }
  }
  return Object.keys(out).length ? out : undefined
}

export interface ScriptMerge {
  merged: PlainTimeline
  /** Per language: how many stored texts were KEPT because the file had none. */
  kept: Partial<Record<ScriptLang, number>>
}

/**
 * One duration's timeline: the file's structure, with every language's text
 * merged in from what was stored. Pure; asserted in tools/test-voice-lang.ts.
 */
export function mergeScripts(stored: PlainTimeline | undefined, incoming: PlainTimeline): ScriptMerge {
  const kept: Partial<Record<ScriptLang, number>> = {}
  if (!stored) return { merged: incoming, kept }
  const oldClips = new Map<string, PlainClip>()
  for (const v of stored.versions) for (const c of v.clips) oldClips.set(c.clipId, c)
  const oldAffs = new Map(stored.affirmations.map((a) => [a.id, a]))

  const versions: PlainVersion[] = incoming.versions.map((v) => ({
    ...v,
    clips: v.clips.map((c) => {
      if (c.tipo !== 'voice') return c
      const byLang = mergeText(clipScript(oldClips.get(c.clipId)), clipScript(c), kept)
      return { ...c, testoByLang: byLang, testo: byLang?.it }
    }),
  }))
  const affirmations: PlainAffirmation[] = incoming.affirmations.map((a) => {
    const byLang = mergeText(affScript(oldAffs.get(a.id)), affScript(a), kept)
    return { ...a, testoByLang: byLang, testo: byLang?.it ?? '' }
  })
  /* The language notes describe the CONTENT, which the merge just changed: a
     Portuguese text kept from storage makes "no Portuguese text yet" untrue. */
  const issues = [
    ...incoming.issues.filter((i) => i.code !== 'script'),
    ...scriptIssues({ versions, affirmations }).filter((i) => !i.sheet || versions.some((v) => v.sheet === i.sheet)),
  ]
  return { merged: { ...incoming, versions, affirmations, issues }, kept }
}

/* --------------------------------------------------------------- compare */

export interface TimelineDiff {
  duration: Duration
  /** Nothing was stored for this duration: everything in the file is new. */
  isNew: boolean
  /** Languages the protocol had no text in before and has now. */
  newLangs: ScriptLang[]
  /** Clip / affirmation ids whose text changed, per language. */
  textChanged: Partial<Record<ScriptLang, string[]>>
  /** …and those that had NO text in that language before (a translation
      arriving is not the same news as a line being rewritten). */
  textAdded: Partial<Record<ScriptLang, string[]>>
  /** Stored texts kept because the file left them empty, per language. */
  textKept: Partial<Record<ScriptLang, number>>
  added: string[]
  removed: string[]
  affAdded: string[]
  affRemoved: string[]
  /** Clips (and affirmations, prefixed "Aff. ") whose timing or parameters
      changed, plus "fasi" / "durata" for the version itself. */
  paramChanged: string[]
  identical: boolean
}

/* Everything on a clip that is NOT its text: timing, levels, fx, archetipo,
   the loop set… `row` is left out because moving a row in the sheet changes
   nothing, and the resolved set/sequence because they follow the sheet. */
const NOT_PARAMS = new Set(['row', 'testo', 'testoByLang', 'setRange', 'sequenzaSteps'])
function paramKey(o: object): string {
  return JSON.stringify(Object.entries(o).filter(([k, v]) => !NOT_PARAMS.has(k) && v !== undefined).sort(([a], [b]) => a.localeCompare(b)))
}

function allLangs(t: PlainTimeline | undefined): Set<ScriptLang> {
  const out = new Set<ScriptLang>()
  if (!t) return out
  for (const v of t.versions) for (const c of v.clips) if (c.tipo === 'voice') langsWithText(clipScript(c)).forEach((l) => out.add(l))
  for (const a of t.affirmations) langsWithText(affScript(a)).forEach((l) => out.add(l))
  return out
}

/** What importing `merged` over `stored` changes, for the admin to confirm. */
export function diffTimelines(duration: Duration, stored: PlainTimeline | undefined, merged: PlainTimeline, kept: Partial<Record<ScriptLang, number>> = {}): TimelineDiff {
  const before = allLangs(stored)
  const after = allLangs(merged)
  const diff: TimelineDiff = {
    duration,
    isNew: !stored,
    newLangs: [...after].filter((l) => !before.has(l)),
    textChanged: {},
    textAdded: {},
    textKept: kept,
    added: [], removed: [], affAdded: [], affRemoved: [], paramChanged: [],
    identical: false,
  }
  const note = (l: ScriptLang, id: string, before: string | undefined) => {
    const bucket = before ? diff.textChanged : diff.textAdded
    ;(bucket[l] ??= []).push(id)
  }
  const oldClips = new Map<string, PlainClip>()
  for (const v of stored?.versions ?? []) for (const c of v.clips) oldClips.set(c.clipId, c)
  const newClips = new Map<string, PlainClip>()
  for (const v of merged.versions) for (const c of v.clips) newClips.set(c.clipId, c)

  for (const [id, c] of newClips) {
    const old = oldClips.get(id)
    if (!old) { if (stored) diff.added.push(id); continue }
    if (paramKey(old) !== paramKey(c)) diff.paramChanged.push(id)
    if (c.tipo !== 'voice') continue
    const a = clipScript(old)
    const b = clipScript(c)
    for (const l of SCRIPT_LANGS) if ((textIn(a, l) ?? '') !== (textIn(b, l) ?? '')) note(l, id, textIn(a, l))
  }
  for (const id of oldClips.keys()) if (!newClips.has(id)) diff.removed.push(id)

  const oldAffs = new Map((stored?.affirmations ?? []).map((a) => [a.id, a]))
  const newAffs = new Map(merged.affirmations.map((a) => [a.id, a]))
  for (const [id, a] of newAffs) {
    const old = oldAffs.get(id)
    if (!old) { if (stored) diff.affAdded.push(id); continue }
    if (paramKey(old) !== paramKey(a)) diff.paramChanged.push(`Aff. ${id}`)
    for (const l of SCRIPT_LANGS) if ((textIn(affScript(old), l) ?? '') !== (textIn(affScript(a), l) ?? '')) note(l, id, textIn(affScript(old), l))
  }
  for (const id of oldAffs.keys()) if (!newAffs.has(id)) diff.affRemoved.push(id)

  const ov = stored?.versions[0]
  const nv = merged.versions[0]
  if (ov && nv) {
    if (Math.abs(ov.durationS - nv.durationS) > 0.01) diff.paramChanged.push('durata')
    if (JSON.stringify(ov.phases) !== JSON.stringify(nv.phases)) diff.paramChanged.push('fasi')
  }

  diff.identical = !diff.isNew
    && !diff.newLangs.length
    && !Object.keys(diff.textChanged).length
    && !Object.keys(diff.textAdded).length
    && !diff.added.length && !diff.removed.length
    && !diff.affAdded.length && !diff.affRemoved.length
    && !diff.paramChanged.length
  return diff
}

/* ------------------------------------------------------------------ plan */

export interface ImportPlan {
  /** The timelines this import writes, per duration (merged, ready to store). */
  written: Partial<Record<Duration, PlainTimeline>>
  /** What each written duration changes. */
  diffs: TimelineDiff[]
  /** Durations the file carries that are NOT written, and why. */
  skipped: { duration: Duration; why: string }[]
  /** The file has no sheet for the selected duration. */
  missingSelected: boolean
  /** Nothing would change: every written duration is identical to what is stored. */
  nothing: boolean
}

/**
 * Which durations of a workbook get written, and as what (see the rules above).
 * With no `selected` duration every duration in the file counts as selected —
 * the behaviour callers without a chip (tools, the legacy importers) expect.
 */
export function planPlainImport({ timeline: t, existing, selected, mode = 'import' }: Pick<PublishInput, 'timeline' | 'existing' | 'selected' | 'mode'>): ImportPlan {
  const stored = timelinesByDuration(existing)
  const plan: ImportPlan = { written: {}, diffs: [], skipped: [], missingSelected: false, nothing: false }
  const seen = new Set<Duration>()
  for (const v of t.versions) {
    const d = catalogDuration(v.durationMin)
    if (!d || seen.has(d)) continue
    seen.add(d)
    const incoming = narrowTimeline(t, v)
    const old = stored[d]
    const isSelected = selected == null || d === selected
    if (old && (mode === 'keep' || !isSelected)) {
      plan.skipped.push({
        duration: d,
        why: mode === 'keep'
          ? `${d} min ha già la sua timeline: resta com’è.`
          : `Il file contiene anche la versione da ${d} min, ma il protocollo ne ha già una: non viene toccata. Seleziona ${d}m e importa di nuovo per aggiornarla.`,
      })
      continue
    }
    const { merged, kept } = mergeScripts(old, incoming)
    plan.written[d] = merged
    plan.diffs.push(diffTimelines(d, old, merged, kept))
  }
  plan.missingSelected = selected != null && !seen.has(selected)
  plan.nothing = plan.diffs.every((x) => x.identical)
  return plan
}

/** The compare summary, one line per fact, in the console's language. */
export function describeImportPlan(plan: ImportPlan, selected?: Duration | null): string[] {
  const lines: string[] = []
  const LBL: Record<ScriptLang, string> = { it: 'italiano', 'pt-BR': 'portoghese', en: 'inglese' }
  const list = (ids: string[], max = 6) => ids.slice(0, max).join(', ') + (ids.length > max ? ` e altre ${ids.length - max}` : '')
  if (plan.missingSelected && selected != null) {
    lines.push(`Il file non contiene la versione da ${selected} min.`)
  }
  for (const d of plan.diffs) {
    const head = `${d.duration} min:`
    if (d.isNew) {
      lines.push(`${head} nuova timeline (nessuna ancora salvata per questa durata).`)
      if (d.newLangs.length) lines.push(`${head} testi in ${d.newLangs.map((l) => LBL[l]).join(' e ')}.`)
      continue
    }
    if (d.identical) { lines.push(`${head} identico a quello salvato — niente da importare.`); continue }
    if (d.newLangs.length) lines.push(`${head} nuova lingua: ${d.newLangs.map((l) => LBL[l]).join(', ')}.`)
    for (const l of SCRIPT_LANGS) {
      const added = d.textAdded[l]
      if (added?.length) lines.push(`${head} testo ${LBL[l]} aggiunto in ${added.length} ${added.length === 1 ? 'riga' : 'righe'} (${list(added)}).`)
      const ids = d.textChanged[l]
      if (ids?.length) lines.push(`${head} testo ${LBL[l]} cambiato in ${ids.length} ${ids.length === 1 ? 'riga' : 'righe'} (${list(ids)}).`)
    }
    for (const l of SCRIPT_LANGS) {
      const n = d.textKept[l]
      if (n) lines.push(`${head} ${n} ${n === 1 ? 'testo' : 'testi'} in ${LBL[l]} già salvat${n === 1 ? 'o' : 'i'} e vuot${n === 1 ? 'o' : 'i'} nel file: restano.`)
    }
    if (d.added.length) lines.push(`${head} ${d.added.length} clip aggiunt${d.added.length === 1 ? 'a' : 'e'} (${list(d.added)}).`)
    if (d.removed.length) lines.push(`${head} ${d.removed.length} clip rimoss${d.removed.length === 1 ? 'a' : 'e'} (${list(d.removed)}).`)
    if (d.affAdded.length) lines.push(`${head} affermazioni aggiunte: ${list(d.affAdded)}.`)
    if (d.affRemoved.length) lines.push(`${head} affermazioni rimosse: ${list(d.affRemoved)}.`)
    if (d.paramChanged.length) lines.push(`${head} tempi o parametri cambiati in ${d.paramChanged.length} ${d.paramChanged.length === 1 ? 'voce' : 'voci'} (${list(d.paramChanged)}).`)
  }
  for (const s of plan.skipped) lines.push(s.why)
  if (!plan.diffs.length) lines.push('Niente da importare per questa durata.')
  return lines
}


/* ------------------------------------------------------------ Studio save */

export interface StudioSaveInput {
  code: string
  duration: Duration
  /** The catalog row as it stands, if the protocol is already known. */
  existing: CatalogProtocol | undefined
  /** The static seed for this code, when there is one. */
  base?: { family?: ProtocolFamily; title?: string; blurb?: string; phases?: SessionPhase[]; versions?: CatalogProtocol['versions'] }
  /** Used as the title when nothing else names the protocol. */
  projectName: string
  now?: number
}

/**
 * The catalog entry a Studio save writes.
 *
 * Saving a session is a valid way to START a protocol — the mix can be built
 * before the workbook is final — so this creates the row when it does not
 * exist. What it creates is a DRAFT:
 *
 * · `enabled: false` on a new protocol. Nothing has been published for it —
 *   no timeline, no rendered audio, nothing a person could be given — so it
 *   must not be switchable on. Publishing a duration from the workscreen is
 *   what activates it.
 * · An EXISTING protocol keeps whatever `enabled` state it already had.
 *   Saving a session must never take a live protocol off the air, and it must
 *   not silently re-activate one an admin deliberately switched off.
 *
 * Everything the Studio does not know about — the public name, the tags, the
 * audience, the other time signatures' timelines and sessions — is spread
 * through untouched.
 */
export function entryForStudioSave({ code, duration, existing, base, projectName, now = Date.now() }: StudioSaveInput): CatalogProtocol {
  const versions = existing?.versions?.length
    ? existing.versions
    : base?.versions?.length ? base.versions : []
  return {
    ...(existing ?? {}),
    code,
    family: existing?.family ?? base?.family ?? familyFromCode(code),
    title: existing?.title ?? base?.title ?? projectName,
    blurb: existing?.blurb ?? base?.blurb ?? '',
    phases: existing?.phases?.length ? existing.phases : base?.phases ?? [],
    // merge, never replace — a 24-minute save must not delete the 6- and
    // 12-minute versions or the audio already attached to them
    versions: mergeVersions(versions, [duration]),
    enabled: existing?.enabled ?? false,
    source: existing?.source ?? 'imported',
    tenants: existing?.tenants ?? 'all',
    audioReady: existing?.audioReady ?? false,
    updatedAt: now,
  }
}
