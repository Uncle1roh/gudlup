/* ============================================================================
   Which ground the app opens on

   The surface was dark because the stylesheet was dark; now it is dark
   because somebody chose it. Four things are worth a test, and they are all
   about what happens when nobody has chosen anything:

     · the default is LIGHT. It is the identity's own colour, and it is the
       one a person who never opens Settings will live in;
     · a value this module does not recognise is not honoured. There is an
       older, almost identical setting next door (`selfuse/theme.ts`, key
       `gl.theme`) whose third value is `auto` — if that string ever reached
       this key, through a copied profile or a hand-edited devtools entry,
       the ground has to fall back rather than write `data-ground="auto"`
       and leave the page with neither set of tokens;
     · a browser with no storage at all (private mode, storage blocked) must
       still paint. The choice is lost, never the page;
     · the attribute and the phone's status bar move together, because a
       cream status bar over a dark page is the one part of the window the
       stylesheet cannot reach.
   ============================================================================ */

import { applyGround, readGround, setGround, isGround, GROUND_OPTIONS } from '../src/ui2/groundChoice'

let failed = 0
let checks = 0
function eq(label: string, got: unknown, want: unknown): void {
  checks++
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  if (a !== b) { failed++; console.log(`FAIL  ${label}\n      got  ${a}\n      want ${b}`) }
  else console.log(`ok  : ${label}`)
}

/* ---- a browser, roughly ------------------------------------------------- */

const store = new Map<string, string>()
const attrs = new Map<string, string>()
let bar = ''

function installBrowser(storage: unknown = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, String(v)) },
}): void {
  const g = globalThis as Record<string, unknown>
  g.localStorage = storage
  g.document = {
    documentElement: {
      setAttribute: (k: string, v: string) => { attrs.set(k, v) },
      getAttribute: (k: string) => attrs.get(k) ?? null,
    },
    querySelector: (sel: string) =>
      (sel.includes('theme-color') ? { setAttribute: (_k: string, v: string) => { bar = v } } : null),
  }
}

installBrowser()

/* ---- nobody has chosen anything ----------------------------------------- */
{
  store.clear()
  eq('an empty browser opens light', readGround(), 'light')
}

/* ---- the neighbour's value, and other rubbish --------------------------- */
{
  for (const junk of ['auto', 'system', 'DARK', '', 'null']) {
    store.set('gl.ground', junk)
    eq(`"${junk}" is not a ground`, readGround(), 'light')
  }
  eq('isGround("auto")', isGround('auto'), false)
  eq('isGround("dark")', isGround('dark'), true)
  eq('isGround("light")', isGround('light'), true)
}

/* ---- what was chosen is what comes back --------------------------------- */
{
  store.clear()
  setGround('dark')
  eq('dark is stored', store.get('gl.ground'), 'dark')
  eq('…and read back', readGround(), 'dark')
  eq('…and written on the document', attrs.get('data-ground'), 'dark')
  eq('…and the status bar follows', bar, '#0c2a22')

  setGround('light')
  eq('light is stored', store.get('gl.ground'), 'light')
  eq('…and read back', readGround(), 'light')
  /* Written for both, although the stylesheet only keys on dark: the page
     should say out loud what it thinks it is. */
  eq('…and written on the document', attrs.get('data-ground'), 'light')
  eq('…and the status bar follows', bar, '#F5EEE4')
}

/* ---- the choice survives the module being asked again ------------------- */
{
  store.set('gl.ground', 'dark')
  attrs.clear()
  applyGround(readGround())
  eq('reapplying puts the stored ground back', attrs.get('data-ground'), 'dark')
}

/* ---- a browser that refuses to remember --------------------------------- */
{
  installBrowser({
    getItem: () => { throw new Error('private mode') },
    setItem: () => { throw new Error('private mode') },
  })
  eq('storage that throws still opens light', readGround(), 'light')
  attrs.clear()
  let threw = false
  try { setGround('dark') } catch { threw = true }
  eq('choosing does not throw', threw, false)
  eq('…and the page still changes', attrs.get('data-ground'), 'dark')
}

/* ---- the two the screen offers, in the order it offers them ------------- */
{
  eq('two grounds', GROUND_OPTIONS.map((g) => g.id), ['light', 'dark'])
  eq('the default is listed first', GROUND_OPTIONS[0].id, readGround())
}

console.log(`\n${checks} checks, ${failed} failed`)
process.exit(failed ? 1 : 0)
