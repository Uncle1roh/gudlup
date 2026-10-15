/* ============================================================================
   Turn the SQL editor's CSV download into one .glstudio.json per session

   supabase/export-studio-sessions.sql QUERY 2 returns two columns, `filename`
   and `glstudio_json`, one row per saved Studio session. The SQL editor can
   only hand you that as a single CSV. This splits it back into the files the
   Studio's ⬆ Restore button reads.

     node tools/split-studio-csv.mjs sessions.csv [out-dir]

   Defaults to ./studio-backups. Nothing is written unless it parses as JSON
   and looks like a session, because a backup you cannot open is worse than
   no backup — it is a backup you believe in.

   No dependencies. The CSV reader is here rather than from a package because
   every one of these rows is a quoted field containing commas, quotes and
   newlines, and this is the part that has to be right.
   ============================================================================ */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const src = process.argv[2] ?? 'sessions.csv'
const outDir = process.argv[3] ?? 'studio-backups'

/** RFC 4180: fields may be quoted; a doubled quote inside a quoted field is
    one literal quote; a quoted field may contain commas and newlines. */
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  let started = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c !== '"') { field += c; continue }
      if (text[i + 1] === '"') { field += '"'; i++; continue }
      quoted = false
      continue
    }
    if (c === '"') { quoted = true; started = true; continue }
    if (c === ',') { row.push(field); field = ''; started = true; continue }
    if (c === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      started = false
      continue
    }
    if (c === '\r') continue
    field += c
    started = true
  }
  if (started || field) { row.push(field); rows.push(row) }
  return rows
}

const rows = parseCsv(readFileSync(src, 'utf8'))
if (!rows.length) {
  console.error(`${src} is empty.`)
  process.exit(1)
}

const header = rows[0].map((h) => h.trim())
const iName = header.indexOf('filename')
const iJson = header.indexOf('glstudio_json')
if (iName < 0 || iJson < 0) {
  console.error(`${src} does not look like QUERY 2's download.`)
  console.error(`Expected columns "filename" and "glstudio_json", found: ${header.join(', ')}`)
  process.exit(1)
}

mkdirSync(outDir, { recursive: true })

let written = 0
const skipped = []

for (let r = 1; r < rows.length; r++) {
  const name = rows[r][iName]
  const json = rows[r][iJson]
  if (!name && !json) continue           // the trailing newline

  if (!name || !json) { skipped.push(`row ${r + 1}: a column is empty`); continue }

  let parsed
  try {
    parsed = JSON.parse(json)
  } catch (e) {
    skipped.push(`${name}: not valid JSON (${e.message})`)
    continue
  }
  if (parsed?.kind !== 'goodloop.studio.session') {
    skipped.push(`${name}: not a Studio session file`)
    continue
  }
  const tracks = parsed?.project?.tracks
  if (!Array.isArray(tracks) || !tracks.length) {
    skipped.push(`${name}: no tracks in it — Restore would refuse this file`)
    continue
  }

  const clips = tracks.reduce((n, t) => n + (t.clips?.length ?? 0), 0)
  writeFileSync(join(outDir, name), json)
  console.log(`${name}  ·  ${tracks.length} tracks, ${clips} clips`)
  written++
}

console.log(`\n${written} session${written === 1 ? '' : 's'} written to ${outDir}/`)
if (skipped.length) {
  console.log(`\n${skipped.length} skipped:`)
  for (const s of skipped) console.log('  -', s)
  process.exit(1)
}
