/* ============================================================================
   Every suite, one command, one verdict

     npm test
     npm test -- session        (only suites whose name contains "session")

   Written because a suite that printed "done." at the end while one
   assertion inside it had failed went unnoticed for four commits: the exit
   code said 1 and nobody was reading it. This reads the exit code, counts
   the assertions, and prints the failing lines of any suite that fails.
   ============================================================================ */

import { spawnSync } from 'node:child_process'
import { buildSync } from 'esbuild'
import { mkdirSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const filter = process.argv[2]
const CACHE = join('node_modules', '.cache', 'gl', 'tests')
mkdirSync(CACHE, { recursive: true })

const suites = readdirSync('tools')
  .filter((f) => f.startsWith('test-') && f.endsWith('.ts'))
  .map((f) => f.slice(0, -3))
  .filter((n) => !filter || n.includes(filter))
  .sort()

if (!suites.length) {
  console.error(filter ? `No suite matches "${filter}".` : 'No suites in tools/.')
  process.exit(1)
}

/* Suites that take a workbook path and do nothing without one. They are not
   failing — there is nothing to run. Give them the file to run them:
     npx esbuild tools/test-plain.ts --bundle --platform=node --format=cjs \
       --outfile=x.cjs && node x.cjs "path/to/GL-ANX 1.1.xlsx"            */
const NEEDS_FILE = new Set([
  'test-plain', 'test-plain-deep', 'test-plain-lufs', 'test-plain-studio', 'test-plain-pools',
])

const failed = []
const skipped = []
let totalOk = 0

for (const name of suites) {
  if (NEEDS_FILE.has(name)) {
    console.log(`skip  ${name.padEnd(26)} needs a workbook path`)
    skipped.push(name)
    continue
  }
  const out = join(CACHE, `${name}.cjs`)
  try {
    /* esbuild's JS API rather than its binary: on Windows the shim is a .cmd
       and execFile refuses it with EINVAL. */
    buildSync({
      entryPoints: [`tools/${name}.ts`],
      bundle: true, platform: 'node', format: 'cjs',
      define: { 'import.meta.env': '{}' },
      outfile: out, logLevel: 'warning',
    })
  } catch (e) {
    console.log(`BUILD FAIL  ${name}`)
    console.log(String(e.message).trim().split('\n').slice(0, 10).map((l) => '    ' + l).join('\n'))
    failed.push(name)
    continue
  }

  const run = spawnSync(process.execPath, [out], { encoding: 'utf8' })
  const text = (run.stdout ?? '') + (run.stderr ?? '')
  const ok = (text.match(/^ok {2}:/gm) ?? []).length
  const bad = text.split('\n').filter((l) => l.startsWith('FAIL'))
  totalOk += ok

  if (run.status === 0 && !bad.length) {
    console.log(`pass  ${name.padEnd(26)} ${String(ok).padStart(4)} assertions`)
    continue
  }
  console.log(`FAIL  ${name.padEnd(26)} ${String(ok).padStart(4)} assertions, ${bad.length} failed`)
  for (const b of bad.slice(0, 8)) console.log('        ' + b)
  if (!bad.length) console.log('        (no FAIL line — the suite exited ' + run.status + ')')
  failed.push(name)
}

const ran = suites.length - skipped.length
console.log('')
if (skipped.length) console.log(`${skipped.length} skipped (need a workbook path): ${skipped.join(', ')}`)
if (failed.length) {
  console.log(`${failed.length} of ${ran} suites FAILED: ${failed.join(', ')}`)
  process.exit(1)
}
console.log(`${ran} suites passed, ${totalOk} assertions.`)
