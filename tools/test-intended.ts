/* ============================================================================
   The screen somebody asked for survives the trip to the door

   WHY THIS EXISTS. A signed-out visitor who opens an app route is sent to
   `#entrar` by a real page LOAD, which is the only thing that mounts the
   right surface — and which destroys the address they asked for. They then
   signed in and landed on their role's home. Half of a P1 pass criterion
   says otherwise: "after logging in, arrives at the originally requested
   screen."

   WHAT THIS GUARDS, in order of what it would cost to get wrong:

   · A TOKEN IS NEVER KEPT. A recovery link arrives as
     `#access_token=…&type=recovery`. Storing that would put a live
     credential in sessionStorage for no reason, and would hijack the
     recovery flow by redirecting it at the end. Refused by shape, and
     refused again on the way out.
   · THE DOOR IS NOT A DESTINATION. Remembering `#entrar`, the landing or a
     marketing page would mean signing in and arriving back where you
     started, which looks exactly like a sign-in that did not work.
   · IT IS SPENT ON FIRST READ. `takeIntended()` clears as it reads, so a
     route left over from an abandoned attempt cannot steer somebody else's
     sign-in on the same tab.
   · A HOSTILE OR BROKEN VALUE CHANGES NOTHING. Storage can hold whatever a
     previous build, another tab or a person with devtools put there, so
     every value is validated on the way OUT as well as in.
   ============================================================================ */

let failed = 0
let checks = 0
function assert(cond: boolean, label: string): void {
  checks++
  if (cond) console.log(`ok  : ${label}`)
  else { failed++; console.log(`FAIL  ${label}`) }
}
function eq(label: string, got: unknown, want: unknown): void {
  checks++
  const a = JSON.stringify(got)
  const b = JSON.stringify(want)
  if (a !== b) { failed++; console.log(`FAIL  ${label}\n      got  ${a}\n      want ${b}`) }
  else console.log(`ok  : ${label}`)
}

/* ---- sessionStorage, roughly -------------------------------------------- */

const store = new Map<string, string>()
const sessionStorageStub = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => { store.set(k, v) },
  removeItem: (k: string) => { store.delete(k) },
}
;(globalThis as unknown as { sessionStorage: typeof sessionStorageStub }).sessionStorage = sessionStorageStub

const { worthRemembering, rememberIntended, takeIntended, clearIntended } =
  await import('../src/auth/intended')

/* ---- what is worth coming back to --------------------------------------- */

assert(worthRemembering('#diario'), 'an app route is worth remembering')
assert(worthRemembering('#admin'), 'so is a console route')
assert(worthRemembering('#workspace/patients'), 'and one with a path in it')

assert(!worthRemembering(''), 'the empty hash is the landing, not a screen')
assert(!worthRemembering('#entrar'), 'the door is not a destination')
assert(!worthRemembering('#como-funciona'), 'nor is a marketing page')
assert(!worthRemembering('#metodo'), 'nor another one')
assert(!worthRemembering('diario'), 'a hash has to start with #')

/* The recovery flow owns its own ending. */
assert(!worthRemembering('#access_token=abc&type=recovery'), 'a recovery fragment is refused')
assert(!worthRemembering('#type=recovery'), 'by its type alone')
assert(!worthRemembering('#refresh_token=abc'), 'a refresh token too')
assert(!worthRemembering('#error=access_denied&error_code=otp_expired'), 'and an expired-link error')
assert(!worthRemembering(`#${'x'.repeat(400)}`), 'and anything absurdly long')

/* ---- the round trip ------------------------------------------------------ */

store.clear()
rememberIntended('#diario')
eq('it comes back', takeIntended(), '#diario')
eq('and only once', takeIntended(), null)

store.clear()
rememberIntended('#entrar')
eq('a refused route is never stored', takeIntended(), null)

store.clear()
rememberIntended('#diario')
clearIntended()
eq('clearing forgets it without using it', takeIntended(), null)

/* ---- storage is not to be trusted --------------------------------------- */

store.clear()
store.set('gl.auth.intended', '#access_token=abc&type=recovery')
eq('a token planted in storage is refused on the way out', takeIntended(), null)
assert(store.size === 0, 'and it is removed while we are there')

store.clear()
store.set('gl.auth.intended', 'https://evil.test/')
eq('an absolute URL is not a hash', takeIntended(), null)

store.clear()
store.set('gl.auth.intended', '#entrar')
eq('the door planted in storage is still not a destination', takeIntended(), null)

/* ---- a browser that refuses storage ------------------------------------- */

;(globalThis as unknown as { sessionStorage: unknown }).sessionStorage = {
  getItem() { throw new Error('private mode') },
  setItem() { throw new Error('private mode') },
  removeItem() { throw new Error('private mode') },
}
let threw = false
try {
  rememberIntended('#diario')
  eq('a browser with no storage reads null', takeIntended(), null)
  clearIntended()
} catch { threw = true }
assert(!threw, 'and nothing throws at the person')

console.log(`\n${checks} assertions, ${failed} failed`)
if (failed) process.exit(1)
