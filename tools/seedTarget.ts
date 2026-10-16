/* ============================================================================
   The guard every destructive tool goes through first

   `npm run seed` and `npm run reset` write and delete. Both take a target
   from the shell, and the one mistake neither may make is running against
   production. The protection is three layers deep, because any single one of
   them is a thing somebody can be tired enough to get past:

     1. The target is passed EXPLICITLY. There is no default, and .env.local
        is deliberately not read: the whole point is that these tools must not
        quietly act on whatever the app happens to be pointed at.
     2. The project ref is compared against a refusal list — the production
        refs in GL_PRODUCTION_REFS, plus whatever `.env.local` points at,
        because that is usually production on a developer's machine.
     3. The operator types the project ref back. Not "yes": the ref, which
        cannot be typed by reflex.

   A service-role key is required and never printed. It bypasses row-level
   security, which is exactly why it belongs in one command's environment and
   not in a file.
   ============================================================================ */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createInterface } from 'node:readline'
import { existsSync, readFileSync } from 'node:fs'

export interface Target {
  url: string
  ref: string
  sb: SupabaseClient
}

function refOf(url: string): string {
  const m = url.match(/^https?:\/\/([a-z0-9]+)\./i)
  return m ? m[1] : url.replace(/^https?:\/\//, '').split('/')[0]
}

/** What `.env.local` points at — treated as production unless proven
    otherwise, because on a developer's machine it usually is. */
function localRef(): string | null {
  if (!existsSync('.env.local')) return null
  for (const raw of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line.startsWith('VITE_SUPABASE_URL')) continue
    const v = line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')
    return v ? refOf(v) : null
  }
  return null
}

function ask(q: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((r) => {
    /* A closed stdin — piped input, a CI runner, `< /dev/null` — answers
       nothing rather than hanging. Nothing is the wrong answer, which is
       the right default for a confirmation. */
    rl.on('close', () => r(''))
    rl.question(q, (a) => { rl.close(); r(a.trim()) })
  })
}

function die(...lines: string[]): never {
  for (const l of lines) console.error(l)
  process.exit(1)
}

/**
 * Resolve and confirm the target, or exit.
 *
 * `what` is the sentence the operator is agreeing to — it is printed back to
 * them before they type the ref, so the confirmation is of a specific act and
 * not of a habit.
 */
export async function resolveTarget(what: string): Promise<Target> {
  const url = (process.env.GL_TARGET_URL ?? '').trim()
  const key = (process.env.GL_SERVICE_KEY ?? '').trim()

  if (!url || !key) {
    die(
      'This tool needs a target and a service-role key, both from the shell:',
      '',
      '  GL_TARGET_URL=https://xxxx.supabase.co \\',
      '  GL_SERVICE_KEY=eyJ... \\',
      '  npm run seed',
      '',
      'The key is in Supabase → Project Settings → API → service_role.',
      'It bypasses row-level security. Do not put it in a file, and never use',
      'the production project’s key with this tool. See docs/ENVIRONMENTS.md.',
    )
  }

  const ref = refOf(url)

  /* Layer 2: the refusal list. */
  const banned = new Set(
    (process.env.GL_PRODUCTION_REFS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
  )
  const local = localRef()
  if (local) banned.add(local)

  if (banned.has(ref)) {
    die(
      `REFUSED: ${ref} is on the production list.`,
      '',
      local === ref
        ? 'It is what .env.local points at, which on a developer machine is production.'
        : 'It is named in GL_PRODUCTION_REFS.',
      '',
      'If this really is a staging or demo project that happens to be in your',
      '.env.local, point .env.local somewhere else for the length of this command.',
    )
  }

  /* Layer 3: type the ref back. */
  console.log('')
  console.log(`  Target:  ${ref}   (${url})`)
  console.log(`  Action:  ${what}`)
  console.log('')
  const typed = await ask(`Type the project ref "${ref}" to go ahead: `)
  if (typed !== ref) die('', 'Not confirmed. Nothing was changed.')

  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  return { url, ref, sb }
}

/** Fail loudly and stop: a half-seeded database is worse than none. */
export function must(label: string, error: { message: string } | null): void {
  if (!error) { console.log(`  ok   ${label}`); return }
  console.error(`  FAIL ${label}: ${error.message}`)
  process.exit(1)
}
