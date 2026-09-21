/* What the workbook actually says about music fades, and what the seed does
   with it. Diagnostic, not a test.

     npx esbuild tools/check-music-fades.ts --bundle --platform=node \
       --format=cjs --outfile=<tmp>/cmf.cjs && node <tmp>/cmf.cjs <file.xlsx>
*/
import { readFileSync } from 'node:fs'
import { parsePlainTimeline } from '../src/admin/plainTimeline'
import { plainToStudioTracks } from '../src/admin/plainStudio'

async function main() {
  const path = process.argv[2]
  if (!path) throw new Error('usage: check-music-fades <workbook.xlsx>')
  const buf = readFileSync(path)
  const res = await parsePlainTimeline(new Uint8Array(buf).buffer as ArrayBuffer)
  if (!res.timeline) throw new Error(res.error ?? 'no timeline')
  const t = res.timeline
  console.log('code:', t.code, '· versions:', t.versions.map((v) => `${v.sheet} ${v.durationMin}m`).join(', '))

  for (const v of t.versions) {
    console.log(`\n=== ${v.sheet} (${v.durationMin} min) ===`)
    const music = v.clips.filter((c) => c.tipo === 'music' || c.tipo === 'soundscape')
    for (const c of music) {
      console.log(
        `  ${String(c.clipId).padEnd(10)} ${c.tipo.padEnd(11)} ${c.traccia.padEnd(14)}`,
        `start=${c.startS}s end=${c.endS}s`,
        `fadeIn=${c.fadeInS}s fadeOut=${c.fadeOutS}s`,
        `xfade=${(c as { crossfadePrecS?: number }).crossfadePrecS ?? 0}s`,
      )
    }
    const seed = plainToStudioTracks(t, v)
    for (const tr of seed.tracks) {
      if (tr.type !== 'sample') continue
      console.log(`  -- seeded lane "${tr.name}"`)
      for (const c of tr.clips) {
        console.log(
          `     start=${c.startSec}s dur=${c.durationSec}s`,
          `fadeIn=${c.fadeInSec ?? 'none'} fadeOut=${c.fadeOutSec ?? 'none'}`,
        )
      }
    }
  }
}

void main()
