/* ============================================================================
   Good Loop — a Studio session as a file on your own disk

   The database is the Studio's memory, and on 14 October 2026 it was not
   reachable. Saves failed, and work that existed only as unsaved state in a
   browser tab had nowhere to go. This is the second copy: one file, written
   by the person at the desk, holding everything `studioByDuration[d]` holds
   and the few things around it that a reopen needs.

   WHAT IS IN IT

     project      the StudioProject itself — exactly the object the database
                  stores. Tracks, clips, levels, EQ, effects, fades, phases,
                  and for every voice clip its text and its rendered audio
                  path in all four variants.
     code         which protocol and which time signature it belongs to, so
                  a restore knows what it is holding and the Save afterwards
                  goes to the right row.
     workingLang  which of the four versions was on screen. Restoring opens
     workingTo    in the same one, rather than silently in Italian-to-a-man.
     scripts      the stored timeline's texts, which the Studio uses to fill
                  a language a session lacks. They come from the protocol's
                  Excel, so if the protocol is gone they are gone too —
                  carrying them makes the file self-sufficient.

   WHAT IS NOT IN IT: audio buffers. A clip re-renders from its parameters,
   and a voice clip re-synthesizes from its text or re-fetches `ttsPath`. The
   file is JSON, a few hundred KB, and readable — if something ever goes
   wrong with this format, the session can be recovered by hand.

   WHY PARSING RETURNS A REASON instead of throwing: the Studio speaks three
   languages, so the module says WHAT was wrong and the screen says it in the
   language the person is reading.
   ============================================================================ */

import type { ScriptIndex, StudioProject } from '../compose/types'
import type { Duration } from '../types/domain'
import type { Addressee, VoiceLang } from '../tts/voiceLang'

/** The marker that says a JSON file is one of ours. */
export const STUDIO_FILE_KIND = 'goodloop.studio.session'

/** Bumped only when an OLDER reader could misread a NEWER file. Adding a
    field that an old reader can ignore is not that. */
export const STUDIO_FILE_VERSION = 1

export const STUDIO_FILE_EXT = '.glstudio.json'

export interface StudioBackup {
  kind: typeof STUDIO_FILE_KIND
  version: number
  /** When the file was written (not when the session was last saved). */
  exportedAt: number
  /** The protocol this session belongs to, when it is known. */
  code: string | null
  duration: Duration | null
  workingLang: VoiceLang
  workingTo: Addressee
  scripts?: ScriptIndex
  project: StudioProject
}

export interface BuildArgs {
  project: StudioProject
  code?: string | null
  duration?: Duration | null
  workingLang: VoiceLang
  workingTo: Addressee
  scripts?: ScriptIndex
  now?: number
}

export function buildStudioBackup(a: BuildArgs): StudioBackup {
  return {
    kind: STUDIO_FILE_KIND,
    version: STUDIO_FILE_VERSION,
    exportedAt: a.now ?? Date.now(),
    code: a.code ?? null,
    duration: a.duration ?? null,
    workingLang: a.workingLang,
    workingTo: a.workingTo,
    scripts: a.scripts,
    project: a.project,
  }
}

/**
 * What the downloaded file is called.
 *
 * The code and the time signature lead, because that is how the POs will
 * look for it; the timestamp makes two backups of the same session sit next
 * to each other in a folder rather than one replacing the other. Everything
 * a filesystem dislikes is folded out — a protocol name can contain a slash,
 * and Windows refuses the file silently when it does.
 */
export function studioBackupFilename(b: Pick<StudioBackup, 'code' | 'duration' | 'project' | 'exportedAt'>): string {
  const stamp = new Date(b.exportedAt).toISOString().slice(0, 16).replace('T', '_').replace(':', '-')
  const parts = [
    safePart(b.code ?? b.project.name ?? 'studio'),
    b.duration != null ? `${b.duration}min` : '',
    stamp,
  ].filter(Boolean)
  return parts.join('_') + STUDIO_FILE_EXT
}

function safePart(raw: string): string {
  return raw
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '-')   // illegal on Windows
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'studio'
}

export type ParseFailure =
  /** Not JSON at all — the wrong file was picked. */
  | 'not-json'
  /** Valid JSON, but not a Good Loop session file. */
  | 'not-ours'
  /** Written by a newer Studio than this one. */
  | 'too-new'
  /** Ours, but with nothing in it to open. */
  | 'empty'

export type ParseResult =
  | { ok: true; backup: StudioBackup }
  | { ok: false; reason: ParseFailure }

/**
 * Read a file back.
 *
 * Strict about the marker and lenient about everything else: a file this
 * reader is handed is one the person believes is their work, so it is opened
 * when it plausibly can be. The one refusal that is not about the file being
 * wrong is `too-new` — a session written by a later Studio may use fields
 * this one would quietly drop, and dropping them on open and then SAVING
 * would destroy them in the database too.
 */
export function parseStudioBackup(text: string): ParseResult {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return { ok: false, reason: 'not-json' }
  }
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not-ours' }
  const o = raw as Record<string, unknown>
  if (o.kind !== STUDIO_FILE_KIND) return { ok: false, reason: 'not-ours' }
  const version = typeof o.version === 'number' ? o.version : 0
  if (version > STUDIO_FILE_VERSION) return { ok: false, reason: 'too-new' }

  const project = o.project as StudioProject | undefined
  if (!project || typeof project !== 'object' || !Array.isArray(project.tracks)) {
    return { ok: false, reason: 'empty' }
  }
  if (!project.tracks.length) return { ok: false, reason: 'empty' }

  return {
    ok: true,
    backup: {
      kind: STUDIO_FILE_KIND,
      version,
      exportedAt: typeof o.exportedAt === 'number' ? o.exportedAt : Date.now(),
      code: typeof o.code === 'string' && o.code.trim() ? o.code.trim().toUpperCase() : null,
      duration: isDuration(o.duration) ? o.duration : null,
      workingLang: o.workingLang === 'pt-BR' ? 'pt-BR' : 'it',
      workingTo: o.workingTo === 'f' ? 'f' : 'm',
      scripts: (o.scripts ?? undefined) as ScriptIndex | undefined,
      project: {
        ...project,
        name: typeof project.name === 'string' && project.name.trim() ? project.name : 'Sessione ripristinata',
        lengthSec: Number.isFinite(project.lengthSec) && project.lengthSec > 0 ? project.lengthSec : fitLength(project),
        masterGain: Number.isFinite(project.masterGain) ? project.masterGain : 0.82,
        savedAt: typeof project.savedAt === 'number' ? project.savedAt : 0,
      },
    },
  }
}

function isDuration(v: unknown): v is Duration {
  return v === 6 || v === 12 || v === 24
}

/** The length a session needs to hold every clip it carries — used only when
    the stored one is missing or nonsense, so a restore is never truncated. */
function fitLength(p: StudioProject): number {
  const end = Math.max(
    120,
    ...p.tracks.flatMap((t) => (t.clips ?? []).map((c) => (c.startSec ?? 0) + (c.durationSec ?? 0))),
  )
  return Math.ceil(end)
}

/** One line describing a parsed file, for the confirmation before it replaces
    what is on screen. Counts clips rather than tracks: an empty rack and a
    full one both have six tracks. */
export function describeStudioBackup(b: StudioBackup): { clips: number; voices: number; when: string } {
  let clips = 0
  let voices = 0
  for (const t of b.project.tracks) {
    clips += t.clips?.length ?? 0
    if (t.type === 'voice') voices += t.clips?.length ?? 0
  }
  return { clips, voices, when: new Date(b.exportedAt).toLocaleString() }
}

/* ======================================================= what it changes ==

   Loading a backup REPLACES what is on screen, and what is on screen may be
   the only copy of an afternoon's work. "3 clips (1 voice), backed up on the
   14th — what is open now is replaced" is true and tells you nothing you can
   decide on: it describes the file, never the distance between the file and
   your desk.

   So this compares them, and it compares the things somebody would actually
   regret: the protocol and time signature it belongs to, how much of the
   rack moves, which voice lines change their words, and how many synthesized
   renders stop being valid. Pure, and asserted in
   tools/test-studio-restore.ts.
   ============================================================================ */

/** The session on screen, in the shape this comparison needs. */
export interface OpenSession {
  project: StudioProject
  code?: string | null
  duration?: Duration | null
  workingLang: VoiceLang
  workingTo: Addressee
  /** False when nothing has been changed since it was opened or saved. */
  dirty?: boolean
}

/**
 * One line of the comparison, as a translation KEY and its numbers.
 *
 * Not a finished sentence: the Studio speaks three languages, and a line
 * built here with the numbers already in it can never be looked up. The
 * screen calls `lt(line.key, line.vars)`, exactly as it does everywhere else.
 */
export interface DiffLine {
  key: string
  vars?: Record<string, string | number>
}

export interface BackupDiff {
  /** Facts that should stop the load until they are read: another protocol,
      another time signature, or unsaved work that is about to go. */
  warnings: DiffLine[]
  /** What changes, one line each. Empty = the file matches what is open. */
  changes: DiffLine[]
  /** Nothing on screen can be lost: it is empty, or identical to the file. */
  harmless: boolean
}

interface ClipFacts {
  count: number
  /** sourceId (or index) → the Italian text, which is the canonical one. */
  textBySource: Map<string, string>
  rendered: number
}

function voiceFacts(p: StudioProject): ClipFacts {
  const textBySource = new Map<string, string>()
  let count = 0
  let rendered = 0
  for (const t of p.tracks) {
    if (t.type !== 'voice') continue
    for (const [i, c] of (t.clips ?? []).entries()) {
      count++
      if (c.ttsPath) rendered++
      const key = c.sourceId ?? `${t.name}#${i}`
      const text = (c.textByLang?.it ?? c.text ?? '').trim()
      if (text) textBySource.set(key, text)
    }
  }
  return { count, textBySource, rendered }
}

function clipTotal(p: StudioProject): number {
  return p.tracks.reduce((n, t) => n + (t.clips?.length ?? 0), 0)
}

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`

/**
 * What loading `b` over `open` would do.
 *
 * Phrased in English keys, like everything else in the Studio, so the screen
 * can say it in the language the person is reading.
 */
export function diffStudioBackup(open: OpenSession, b: StudioBackup): BackupDiff {
  const warnings: DiffLine[] = []
  const changes: DiffLine[] = []

  /* ---- is this even the same piece of work? ------------------------- */
  const openCode = (open.code ?? '').trim().toUpperCase()
  const fileCode = (b.code ?? '').trim().toUpperCase()
  if (openCode && fileCode && openCode !== fileCode) {
    warnings.push({ key: 'This backup is {code}. You are working on {open}.', vars: { code: fileCode, open: openCode } })
  }
  if (open.duration != null && b.duration != null && open.duration !== b.duration) {
    warnings.push({
      key: 'This backup is the {n}-minute version. You are working on {open} minutes.',
      vars: { n: b.duration, open: open.duration },
    })
  }

  const openClips = clipTotal(open.project)
  const empty = openClips === 0
  if (!empty && open.dirty) {
    warnings.push({ key: 'What is open has changes that were never saved. Loading replaces them and they cannot be recovered.' })
  }

  /* ---- the rack ------------------------------------------------------ */
  const fileClips = clipTotal(b.project)
  if (openClips !== fileClips) {
    changes.push({ key: '{a} clips on screen → {b} in the backup.', vars: { a: openClips, b: fileClips } })
  }
  const openTracks = open.project.tracks.length
  const fileTracks = b.project.tracks.length
  if (openTracks !== fileTracks) changes.push({ key: '{a} tracks → {b}.', vars: { a: openTracks, b: fileTracks } })

  if (Math.abs((open.project.lengthSec || 0) - (b.project.lengthSec || 0)) > 1) {
    changes.push({
      key: 'Length {a} → {b}.',
      vars: { a: mmss(open.project.lengthSec || 0), b: mmss(b.project.lengthSec || 0) },
    })
  }
  if (Math.abs((open.project.masterGain ?? 0) - (b.project.masterGain ?? 0)) > 0.005) {
    changes.push({ key: 'The master level is different.' })
  }
  if (JSON.stringify(open.project.phases ?? []) !== JSON.stringify(b.project.phases ?? [])) {
    changes.push({ key: 'The phase map is different.' })
  }

  /* ---- the words, which are the expensive part ----------------------- */
  const a = voiceFacts(open.project)
  const f = voiceFacts(b.project)
  let reworded = 0
  let onlyOpen = 0
  for (const [k, text] of a.textBySource) {
    const other = f.textBySource.get(k)
    if (other === undefined) onlyOpen++
    else if (other !== text) reworded++
  }
  let onlyFile = 0
  for (const k of f.textBySource.keys()) if (!a.textBySource.has(k)) onlyFile++

  if (reworded) changes.push({ key: '{n} voice lines are worded differently in the backup.', vars: { n: reworded } })
  if (onlyOpen) changes.push({ key: '{n} voice lines on screen are not in the backup at all.', vars: { n: onlyOpen } })
  if (onlyFile) changes.push({ key: '{n} voice lines in the backup are not on screen.', vars: { n: onlyFile } })
  if (a.rendered > f.rendered) {
    changes.push({
      key: '{n} synthesized voice clips lose their render and have to be spoken again.',
      vars: { n: a.rendered - f.rendered },
    })
  }

  /* ---- which version it opens in ------------------------------------- */
  if (b.workingLang !== open.workingLang || b.workingTo !== open.workingTo) {
    changes.push({ key: 'It opens in a different version (language or form) from the one you are in.' })
  }

  /* ---- newer or older ------------------------------------------------ */
  const openSaved = typeof open.project.savedAt === 'number' ? open.project.savedAt : 0
  if (openSaved && b.exportedAt < openSaved) {
    warnings.push({ key: 'This backup is OLDER than the session on screen. Loading it goes back in time.' })
  }

  return { warnings, changes, harmless: empty || (!warnings.length && !changes.length) }
}
