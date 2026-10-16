/* ============================================================================
   Which rows become which backup files

   The one piece of judgement in a Studio backup: a protocol row holds up to
   three per-duration sessions plus, on older rows, a single pre-split one,
   and the question of which belongs to which time signature already has an
   answer in the app (`studioFor`). This calls that answer and turns the
   result into named files.

   It is a separate module from the CLI so the decision can be asserted
   without a database — see tools/test-backup-studio.ts.
   ============================================================================ */

import { CATALOG_DURATIONS, studioFor } from '../src/data/catalog'
import { buildStudioBackup, studioBackupFilename, type StudioBackup } from '../src/studio/sessionFile'
import type { StudioProject } from '../src/compose/types'
import type { Duration } from '../src/types/domain'

/** A protocol row as the backup reads it: three columns, nothing heavy. */
export interface ProtocolRow {
  code: string
  studio?: StudioProject | null
  studio_by_duration?: Partial<Record<Duration, StudioProject>> | null
}

export interface BackupEntry {
  file: string
  code: string
  duration: Duration
  tracks: number
  clips: number
  voiceClips: number
  /** When the session was last saved in the Studio, not when it was exported. */
  savedAt: number
  backup: StudioBackup
}

/**
 * Every session in `rows`, as a named file each.
 *
 * A session with no tracks is skipped rather than written: Restore refuses
 * an empty session, so writing one would put a file in the folder that
 * cannot be used and would make the count look right when it is not.
 */
export function sessionsFromRows(rows: ProtocolRow[], now: number): BackupEntry[] {
  const out: BackupEntry[] = []
  for (const row of rows) {
    const p = { studio: row.studio ?? undefined, studioByDuration: row.studio_by_duration ?? undefined }
    for (const duration of CATALOG_DURATIONS) {
      const project = studioFor(p, duration)
      if (!project?.tracks?.length) continue

      const backup = buildStudioBackup({
        project, code: row.code, duration,
        workingLang: 'it', workingTo: 'm',
        now,
      })
      let clips = 0
      let voiceClips = 0
      for (const t of project.tracks) {
        const n = t.clips?.length ?? 0
        clips += n
        if (t.type === 'voice') voiceClips += n
      }
      out.push({
        file: studioBackupFilename(backup),
        code: row.code,
        duration,
        tracks: project.tracks.length,
        clips,
        voiceClips,
        savedAt: typeof project.savedAt === 'number' ? project.savedAt : 0,
        backup,
      })
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file))
}

export interface Manifest {
  takenAt: string
  database: string
  protocols: number
  sessions: number
  files: { file: string; code: string; duration: Duration; tracks: number; clips: number; voiceClips: number; savedAt: string | null }[]
}

/** The list that makes a backup checkable: diff it against the next run and
    a session that vanished, or one whose clip count fell, is a changed line. */
export function manifestFor(entries: BackupEntry[], opts: { now: number; database: string; protocols: number }): Manifest {
  return {
    takenAt: new Date(opts.now).toISOString(),
    database: opts.database,
    protocols: opts.protocols,
    sessions: entries.length,
    files: entries.map((e) => ({
      file: e.file,
      code: e.code,
      duration: e.duration,
      tracks: e.tracks,
      clips: e.clips,
      voiceClips: e.voiceClips,
      savedAt: e.savedAt ? new Date(e.savedAt).toISOString() : null,
    })),
  }
}
