/* ============================================================================
   Good Loop — Auth
   Two modes, chosen by env, mirroring the data layer:
     - mock     : no Supabase env → a stub "signed-in" user, no login screen, so
                  the app runs exactly as before for local/demo work.
     - supabase : real email + password sessions via Supabase Auth.
   On sign-up we also create the app-level rows the data layer reads:
     profiles (role) for everyone, plus a therapists row for clinicians.
   Email confirmation should be OFF while testing so sign-up returns a session
   immediately (see docs/AUTH_SETUP.md).
   ============================================================================ */

import { useI18n } from '../i18n'
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { getSupabaseClient, hasSupabaseEnv } from './supabaseClient'
import { clearIntended } from './intended'
/* `#entrar` — the one sign-in screen, named where every other route is. */
import { R_LOGIN } from '../components/ambient/stage'
import { stashMockLegalProfile } from '../data/mockLegal'

export type Role = 'b2c_user' | 'therapist' | 'admin' | 'hr_admin' | 'sales'

export interface AuthUser { id: string; email: string }
export interface SignUpExtra {
  name?: string; crp?: string; companyId?: string; team?: string
  /** Sent as typed; the database looks up what it is worth (setup.sql,
      PROMO CODES) — the client never writes the percentage. */
  promoCode?: string
  /** Who the person is for legal purposes (ONB-01 / ONB-03): the 18+ gate
      and the market. Both are asked before the account exists and written
      with it, so no account is ever created without them. */
  birthDate?: string
  country?: string
  locale?: string
  /** 'm' | 'f' — which recording of a protocol this person hears. */
  addressedAs?: 'm' | 'f'
}

export interface AuthApi {
  /** The session AND the role are known. A gate must not decide before this. */
  ready: boolean
  user: AuthUser | null
  /**
   * What this account IS, read back from its profile row.
   *
   * The gate used to ask only whether somebody was signed in, so any account
   * that could log in anywhere could open the admin console — restricted in
   * what it could DO, thanks to RLS, but standing inside it and reading the
   * catalogue, the companies and the audit log. The role is what says which of
   * the four surfaces an account belongs to, so it has to be loaded before the
   * first render of any of them.
   *
   * Null means signed in with NO profile row: not a role to fall back from,
   * an account that cannot be placed. It opens nothing.
   */
  role: Role | null
  mode: 'demo' | 'supabase'
  /** `role` is honoured in DEMO mode only — with no profiles table, the door a
      tester came through is the only thing that can say who they are. In
      Supabase mode the profile decides and this argument is ignored. */
  signIn(email: string, password: string, role?: Role): Promise<void>
  signUp(email: string, password: string, role: Role, extra?: SignUpExtra): Promise<void>
  signOut(): Promise<void>
  /**
   * Give a half-made account's address back.
   *
   * For the one state the product could not leave: signed in, no profile row.
   * `signUp` rolls its own failure back, but an INTERRUPTED sign-up — the tab
   * closed, the network dropped — leaves nobody to run it, and the address
   * stays taken by an account that opens nothing. `abandon_orphan_signup()`
   * (supabase/41) deletes the login, and only ever the caller's own, and only
   * while it has no profile. Throws with something sayable if it cannot.
   */
  releaseHalfMadeAccount(): Promise<void>
  /**
   * Send a reset link. Resolves whether or not the address has an account —
   * telling a stranger which emails are registered is an account-enumeration
   * leak, and the screen says "if that address has an account" for the same
   * reason.
   */
  resetPassword(email: string): Promise<void>
  /**
   * Change the password of the person already signed in.
   *
   * `current` is not ceremony. Supabase authorises the change on the SESSION
   * alone, so without this check anyone holding an unlocked phone could lock
   * the owner out of their own account from the Profile screen. Re-entering
   * the old password proves it is still the owner at the keyboard.
   *
   * Throws `WRONG_PASSWORD` when `current` does not match, so the caller can
   * say which field is wrong instead of showing one vague failure.
   */
  updatePassword(current: string, next: string): Promise<void>
  /**
   * ARRIVED HERE FROM A RESET LINK, and therefore allowed to set a password
   * without proving the old one.
   *
   * True from the moment Supabase reports `PASSWORD_RECOVERY` — which it
   * does after consuming the token in the link — until a new password is
   * set or the tab is closed. The whole reason it exists: the link signed a
   * person in, and the only way to change a password from inside the app
   * asks for the CURRENT one, which is the thing they have forgotten. So
   * the link worked and led nowhere, which is how it was reported.
   */
  recovering: boolean
  /** Set a new password on the strength of the recovery link alone. */
  completeRecovery(next: string): Promise<void>
  /**
   * TURNED OFF by an admin (`profiles.active = false`).
   *
   * Deactivating somebody in console → Utenti e ruoli wrote the column and
   * nothing read it: the account signed in and opened its surface as
   * before. So the one control for cutting an account loose did nothing,
   * which is how it was reported.
   *
   * Null until the profile has been read, so a gate can wait rather than
   * bounce somebody off their own app for a moment.
   */
  deactivated: boolean | null
}

/** Thrown by `updatePassword` when the current password is not right. */
export const WRONG_PASSWORD = 'WRONG_PASSWORD'

const AuthCtx = createContext<AuthApi | null>(null)

const SB_URL = import.meta.env.VITE_SUPABASE_URL
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

/* Demo mode keeps a local "session" in localStorage so the login is real-feeling
   and survives refreshes during a demo — no backend required. */
const DEMO_KEY = 'gl-demo-session'
interface DemoSession extends AuthUser { role: Role }
function readDemoUser(): DemoSession | null {
  try {
    const s = localStorage.getItem(DEMO_KEY)
    if (!s) return null
    const u = JSON.parse(s) as Partial<DemoSession>
    if (!u?.id) return null
    // a session stored before roles existed is a patient account, which is the
    // surface the app opens on by default
    return { id: u.id, email: u.email ?? '', role: u.role ?? 'b2c_user' }
  } catch { return null }
}

/**
 * Which surface a demo address belongs to.
 *
 * Only reachable in demo mode (no Supabase configured), where there is no
 * profile row to read a role from. A real deployment never calls this: the
 * account's own record answers, which is the only answer that can be
 * trusted anyway.
 */
function demoRoleFor(email: string): Role {
  const addr = (email || '').trim().toLowerCase()
  if (addr === 'admin@goodloop.app') return 'admin'
  if (addr === 'comercial@goodloop.app' || addr === 'commerciale@goodloop.app') return 'sales'
  if (addr.endsWith('@clinic.demo')) return 'therapist'
  if (addr === 'camila@aurora.co' || addr.startsWith('hr@') || addr.startsWith('rh@')) return 'hr_admin'
  return 'b2c_user'
}

/**
 * Take back the login that a failed sign-up left behind.
 *
 * Called from the one place that can need it: the catch around step two of
 * `signUp`, where a login exists and the person it was for does not. The
 * account is seconds old, was created by this same call, and owns nothing —
 * no sessions, no readings, no consents, no company seat — so removing it
 * costs nothing and frees the address.
 *
 * TWO FUNCTIONS, because by then the account can be in either of two states:
 *
 *   · no profile  → `abandon_orphan_signup()` (supabase/41). It takes no
 *     argument, so it cannot be aimed at anyone else, and it refuses the
 *     moment a profile exists.
 *   · a profile, but the clinician row after it failed →
 *     `delete_my_account()`, which owns that case and is the only path that
 *     detaches clinical records properly.
 *
 * Failures here are swallowed deliberately. The person is reading a refusal
 * about their company code; a second error about cleaning up tells them
 * nothing they can act on, and a stranded login beats a form that hangs.
 * The script's own query lists anything left behind.
 */
async function undoHalfMadeAccount(
  sb: ReturnType<typeof getSupabaseClient>,
  uid: string,
  profileWasMade: boolean,
): Promise<void> {
  /* WHOSE account is this? Neither RPC takes an argument: both act on the
     session the client holds AT THE MOMENT THEY RUN, and that is not
     necessarily the account this sign-up created. supabase-js shares its
     session between tabs through localStorage, so a person who gives up on a
     hanging form and signs in with their existing account in a second tab has
     replaced this client's session — and `delete_my_account()` would then
     delete the account they have had for a year, clinical records and all.
     Rare, and irreversible, which is the combination that earns a check. */
  let live: string | undefined
  try { live = (await sb.auth.getSession()).data.session?.user?.id } catch { /* treated as a mismatch */ }
  if (live !== uid) {
    console.warn('[goodloop] Sign-up rollback skipped: the session in this tab is no longer the account that was just created.')
    return
  }

  try {
    const { error } = await sb.rpc('abandon_orphan_signup')
    /* `delete_my_account()` is for the OTHER case — the profile row was
        written and the clinician row after it failed — and it is the only path
        that detaches clinical records properly. Calling it on any error at all
        would mean calling it when `abandon_orphan_signup` is simply missing
        (script 41 not applied yet), where it has nothing to delete, or when
        the refusal was "this account has a profile" for a profile this call
        never made. So it is reached only when this call made one. */
    if (error && profileWasMade) await sb.rpc('delete_my_account')
    else if (error) console.warn('[goodloop] Could not release the half-made login:', error.message, '— run supabase/41 if you have not.')
  } catch { /* see above: nothing here is the person's problem */ }

  /* Whatever happened to the row, this tab must not keep acting signed in —
     and that has to be true even with no network. The default scope is
     'global', which calls /logout and keeps the local session when the call
     fails: exactly the state this whole function exists to prevent. 'local'
     needs no round trip. */
  try { await sb.auth.signOut({ scope: 'local' }) } catch { /* the session dies with the tab */ }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supa = hasSupabaseEnv()
  const demoSession = supa ? null : readDemoUser()
  const [ready, setReady] = useState(!supa) // demo is ready immediately
  const [user, setUser] = useState<AuthUser | null>(demoSession)
  const [role, setRole] = useState<Role | null>(demoSession?.role ?? null)
  /* ---- arrived from a reset link ----------------------------------------

     Supabase's client consumes the token in the link and signs the person
     in, then reports `PASSWORD_RECOVERY`. Without that flag the app simply
     opened — signed in, on the library, with no way to set a password,
     because the only screen that changes one asks for the CURRENT password
     and that is exactly what was forgotten. The link worked and led
     nowhere.

     Seeded from the URL as well as from the event: the fragment is already
     in the address bar on the first render, and the event can arrive after
     it, so reading both means the recovery screen is there from the first
     frame rather than flashing the library first. */
  /** Null until the profile row has been read; see `AuthApi.deactivated`. */
  const [deactivated, setDeactivated] = useState<boolean | null>(null)

  const [recovering, setRecovering] = useState(() => {
    try {
      return /(^|[#&])type=recovery(&|$)/.test(window.location.hash)
    } catch {
      return false
    }
  })

  /* ---- the role of an account THIS tab has just created --------------------

     Signing up is two writes, and only the first one is Supabase's. `signUp`
     creates the login — which starts a session, which fires the auth listener,
     which reads `profiles` for a role — and only THEN do we insert the profile
     row the listener is looking for. The listener almost always wins that
     race, finds nothing, and the gate tells a person who has just filled in
     the whole form that their account "is not set up yet".

     It was a true statement for about two hundred milliseconds, and the screen
     that said it had no way of ever being told otherwise.

     So the one tab that knows what was just created remembers it. It is set
     only AFTER the profile insert has actually succeeded — never before, or a
     failed insert would hand the account a role it does not have in the
     database and let it into a surface it cannot read. */
  const createdRole = useRef<Role | null>(null)
  /* True from the moment `auth.signUp` returns a session until the profile row
     either exists or has been rolled back. See `apply()`. */
  const signingUp = useRef(false)

  useEffect(() => {
    if (!supa) return
    const sb = getSupabaseClient(SB_URL as string, SB_KEY as string)
    let active = true

    /** The account's role, from its profile row. A missing row is not an error
        to throw at a person: it resolves to null, and the gate then says the
        account has no surface yet instead of showing a failure. */
    async function loadRole(uid: string): Promise<{ role: Role | null; active: boolean | null }> {
      /* `active` comes back with the role, in the one query the gate already
         waits for — an account that has been turned off must not get as far
         as a surface, and asking separately would mean a frame in which it
         had. */
      const { data, error } = await sb.from('profiles').select('role, active').eq('auth_uid', uid).maybeSingle()
      if (error) return { role: null, active: null }
      const row = data as { role?: Role; active?: boolean } | null
      return {
        role: (row?.role as Role | undefined) ?? null,
        /* No row is not "turned off": it is an account with no profile yet,
           which the gate already has its own answer for. */
        active: row ? row.active !== false : null,
      }
    }

    async function apply(u: { id: string; email?: string } | undefined) {
      if (!u) {
        if (!active) return
        /* However the session ended — this tab, another tab, a refresh token
           that died, or the sign-up rollback, which signs out directly — a
           route remembered for a sign-in that never happened must not steer
           the NEXT one. `toTheDoor()` clears it on the ordinary path; this
           covers the others. */
        clearIntended()
        setUser(null); setRole(null); setDeactivated(null); setReady(true)
        return
      }
      /* A sign-up is MID-FLIGHT, and this is its own SIGNED_IN event.
         Publishing the user here is what made a refused sign-up silent: the
         login exists before the profile does, so `loadRole` finds no row, the
         route guard reads a signed-in account with no surface, replaces the
         form with a spinner and sends the person to the landing page — and the
         refusal, when it finally arrives a few round trips later, is set on a
         component that no longer exists. The person is left on the marketing
         page with an empty form and no idea the company code was wrong.

         So nothing is published until `signUp` has finished. It publishes the
         account itself on success, and on failure the sign-out below arrives
         with no user and takes the ordinary path. */
      if (signingUp.current) return
      const got = await loadRole(u.id)
      const r = got.role
      /* Checked again: the sign-up may have failed WHILE this query was in
         flight, in which case the session is already gone. */
      if (!active || signingUp.current) return
      setUser({ id: u.id, email: u.email ?? '' })
      setDeactivated(got.active === null ? null : !got.active)
      /* `createdRole` is read HERE, when the answer is used, not when the
         query was sent: whichever of the two finishes last is right, so the
         sign-up is correct in both orders. */
      setRole(r ?? createdRole.current)
      /* ready LAST. A gate that rendered between the session arriving and the
         role arriving would see a signed-in account with no role and bounce it
         off its own surface. */
      setReady(true)
    }

    void sb.auth.getSession().then(({ data }) => { void apply(data.session?.user) })
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      void apply(session?.user)
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [supa])

  const api = useMemo<AuthApi>(() => {
    if (!supa) {
      /* Demo mode — any credentials work.
         The DOOR used to decide the role, and with a door per app that was
         right. There is one public door now (POs, 2026-11-06), so a door
         that decided would make every demo sign-in a listener, including
         the clinician's. Without a profiles table to ask, the ADDRESS
         decides instead, from the demo's own cast; the two internal doors
         still pass their role and still win. */
      const enter = (email: string, r: Role) => {
        const u: DemoSession = { id: 'demo-' + (email || 'user'), email: email || 'demo@goodloop.app', role: r }
        try { localStorage.setItem(DEMO_KEY, JSON.stringify(u)) } catch { /* ignore */ }
        setUser({ id: u.id, email: u.email })
        setRole(r)
      }
      return {
        ready: true, user, role, mode: 'demo',
        /* A demo has no profiles table to be switched off in. */
        deactivated: false,
        /* No mailbox, so no link, so never recovering. */
        recovering: false,
        async completeRecovery() { /* demo mode has no password to set */ },
        async signIn(email, _password, r) { enter(email, r ?? demoRoleFor(email)) },
        async resetPassword() { /* demo mode has no mailbox to send to */ },
        async updatePassword() { /* demo mode has no password to change */ },
        async signUp(email, _password, r, extra) {
          stashMockLegalProfile({
            name: extra?.name || email.split('@')[0], email: email || 'demo@goodloop.app',
            birthDate: extra?.birthDate ?? null, country: extra?.country ?? null,
            market: extra?.country === 'BR' ? 'BR' : extra?.country === 'IT' ? 'EU' : null,
            locale: extra?.locale ?? null, companyId: extra?.companyId ?? null,
          })
          enter(email, r)
        },
        async signOut() {
          try { localStorage.removeItem(DEMO_KEY) } catch { /* ignore */ }
          setUser(null); setRole(null)
          toTheDoor()
        },
        /* A demo has no half-made accounts: there is no profiles table for an
           insert to fail against, so the state this repairs cannot be reached
           here. Signing out is the honest equivalent. */
        async releaseHalfMadeAccount() {
          try { localStorage.removeItem(DEMO_KEY) } catch { /* ignore */ }
          setUser(null); setRole(null)
          toTheDoor()
        },
      }
    }
    const sb = getSupabaseClient(SB_URL as string, SB_KEY as string)
    return {
      ready, user, role, mode: 'supabase',
      deactivated,
      recovering,
      async completeRecovery(next: string) {
        /* No `current` here, and that is the whole point: the person proved
           who they are by opening a link sent to their own address, and the
           password they would be asked for is the one they have forgotten.
           Supabase authorises this on the recovery session alone. */
        const { error } = await sb.auth.updateUser({ password: next })
        if (error) throw error
        setRecovering(false)
        /* Take the token out of the address bar: it is spent, and a URL
           carrying one does not belong in history or in a paste. */
        try {
          window.history.replaceState(null, '', `${window.location.origin}${window.location.pathname}`)
        } catch { /* sandboxed: the bar keeps it, which costs tidiness */ }
      },
      async signIn(email, password) {
        const { error } = await sb.auth.signInWithPassword({ email, password })
        if (error) throw error
      },
      async signUp(email, password, role, extra) {
        const { data, error } = await sb.auth.signUp({ email, password })
        if (error) throw error
        const uid = data.user?.id
        /* From here the login may exist, so the listener must hold its tongue
           until this function knows whether there is an account to show.
           Cleared in `finally`, including on the paths that throw. */
        if (uid && data.session) signingUp.current = true
        /* No user, or a user with no session, both mean the same thing: email
           confirmation is ON in Supabase Auth. That is a setting, not
           something the person at the form did, and the menu path to it is of
           no use to them — so they read one plain sentence and the detail goes
           to the console, where whoever can change it will be looking. */
        if (!uid || !data.session) {
          console.warn(
            '[goodloop] Sign-up returned no session: email confirmation is ON in '
            + 'Supabase (Authentication → Sign In / Providers → Email → "Confirm '
            + 'email"). Turn it off, or finish the flow by confirming the address. '
            + 'See docs/AUTH_SETUP.md.',
          )
          throw new Error('We could not finish creating your account just now. Try again in a moment.')
        }
        /* ------------------------------------------------------------------
           EVERYTHING BELOW RUNS WITH A LOGIN THAT ALREADY EXISTS.

           Sign-up is two writes against two services and only the first is a
           transaction. Step two can refuse for good reasons — a company code
           with one wrong character is a foreign-key violation, the roster
           trigger turns away an address the employer has not approved, a
           promo code can be unknown — and each of those used to leave the
           login behind. The address was then TAKEN by an account with no
           profile: signing up again said "this address already has an
           account", signing in landed nowhere because the role is read from
           the profile, and nothing in the product could undo it
           (`delete_my_account()` starts from `current_profile()`, which is
           null for precisely these accounts).

           So the person read the right sentence and lost their work address
           to a typo. Whatever the refusal is, the half-made login goes.
           ------------------------------------------------------------------ */
        /* Which half of the sign-up got done, so the rollback knows which of
           the two cleanup paths belongs to this failure. */
        let profileWasMade = false
        try {
          const { error: pErr } = await sb.from('profiles').insert({
            auth_uid: uid, role, name: extra?.name ?? email.split('@')[0], email,
            company_id: extra?.companyId?.trim() || null,
            team: extra?.team?.trim() || null,
            promo_code: extra?.promoCode?.trim() || null,
            birth_date: extra?.birthDate || null,
            addressed_as: extra?.addressedAs ?? null,
            country: extra?.country || null,
            locale: extra?.locale || 'it',
          })
          if (pErr) {
            if ((pErr as { code?: string }).code === '23503')
              throw new Error('Unknown company code — ask HR for the right one.')
            if ((pErr as { hint?: string }).hint === 'PROMO_UNKNOWN')
              throw new Error('This promo code is not valid. Check it, or leave the field empty.')
            /* The company keeps a list of the addresses it approves, and this
               one is not on it. The door checks this before submitting; the
               database checks it again, and this is where that answer becomes
               a sentence rather than a constraint violation. */
            if ((pErr as { hint?: string }).hint === 'COMPANY_NOT_APPROVED')
              throw new Error('This company only accepts addresses it has approved, and this one is not among them. Ask your HR contact to add it, or create your account without the code.')
            /* Anything else is a database answer, not a sentence: it can
               carry a table, a policy or a constraint name, and that reaches
               the person verbatim through `authErrorKey`. The detail goes to
               the console for whoever is looking; the person gets something
               they can act on. */
            console.warn('[goodloop] Sign-up refused by the profiles insert:', pErr)
            throw new Error('We could not finish creating your account just now. Check the details and try again.')
          }
          profileWasMade = true
          if (role === 'therapist') {
            const { data: prof, error: gErr } = await sb.from('profiles').select('id').eq('auth_uid', uid).single()
            if (gErr) {
              console.warn('[goodloop] Sign-up could not read back the profile it just wrote:', gErr)
              throw new Error('We could not finish creating your account just now. Try again in a moment.')
            }
            const { error: tErr } = await sb.from('therapists').insert({
              id: (prof as { id: string }).id, crp: extra?.crp ?? '', status: 'pending',
            })
            if (tErr) {
              console.warn('[goodloop] Sign-up refused by the therapists insert:', tErr)
              throw new Error('We could not finish creating your clinician record just now. Try again in a moment.')
            }
          }
        } catch (e) {
          await undoHalfMadeAccount(sb, uid, profileWasMade)
          throw e
        } finally {
          signingUp.current = false
        }
        /* The row exists now. Remember it for a listener that already looked
           and found nothing, and set it directly for the case where no further
           listener runs at all. Both are needed: the two finish in either
           order, and only one of them can be last. */
        createdRole.current = role
        setUser({ id: uid, email })
        setDeactivated(false)
        setRole(role)
      },
      async signOut() {
        createdRole.current = null
        await sb.auth.signOut()
        toTheDoor()
      },
      async releaseHalfMadeAccount() {
        const { error } = await sb.rpc('abandon_orphan_signup')
        if (error) {
          /* The function is not there: script 41 has not been run on this
             project. Nothing the person can do, and nothing they should read
             as their own fault. */
          console.warn('[goodloop] abandon_orphan_signup failed:', error)
          throw new Error('We could not release this address. The goodloop team can finish it.')
        }
        createdRole.current = null
        /* No round trip: the login this session belonged to no longer exists,
           so a global sign-out would be asking a deleted user to log out. */
        try { await sb.auth.signOut({ scope: 'local' }) } catch { /* the session dies with the tab */ }
        toTheDoor()
      },
      async resetPassword(email: string) {
        /* The redirect comes back to THIS app with a recovery token in the
           URL fragment; Supabase's client picks it up and the person is signed
           in long enough to set a new password. */
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}${window.location.pathname}`,
        })
        /* A rejected address is not reported: the caller shows the same
           message either way. Only a transport failure is worth raising. */
        if (error && !/user not found/i.test(error.message)) throw error
      },
      async updatePassword(current: string, next: string) {
        const email = user?.email
        if (!email) throw new Error('Not signed in.')
        /* Prove it is still the account holder. signInWithPassword on the
           SAME account refreshes the session rather than disturbing it, so a
           correct password costs nothing and a wrong one never reaches the
           change below. */
        const { error: wrong } = await sb.auth.signInWithPassword({ email, password: current })
        if (wrong) throw new Error(WRONG_PASSWORD)
        const { error } = await sb.auth.updateUser({ password: next })
        if (error) throw error
      },
    }
  }, [supa, ready, user, role])

  return <AuthCtx.Provider value={api}>{children}</AuthCtx.Provider>
}

export function useAuth(): AuthApi {
  const a = useContext(AuthCtx)
  if (!a) throw new Error('useAuth must be used inside <AuthProvider>')
  return a
}

/** Sign-out button (shown in both demo and Supabase modes). */
/**
 * Where signing out leaves you: THE ONE SIGN-IN SCREEN (`#entrar`).
 *
 * It used to leave you exactly where you were, which on a console meant the
 * console's own sign-in page — a door the POs reported as "an older version,
 * still with mountains/blue", because it is: the hero shell dresses the
 * public door, and the admin and commercial doors are separate screens with
 * their own stage. That was answered by sending everyone to the LANDING,
 * which fixed the wrong door and introduced a different complaint: somebody
 * who signs out of the admin console, the commercial console or a company
 * dashboard is almost always signing out to sign back in, and the landing
 * is a marketing page with one more click in the way. The owner asked for
 * the main login screen (2026-11-23), so that is where every account now
 * lands, whichever surface it left.
 *
 * AND IT IS A REAL LOAD. The old line set `href` to the path with the hash
 * REMOVED, which from `#admin` is a same-document navigation: the browser
 * changes the URL, fires `hashchange`, and does not reload — so the full
 * load this comment promised never happened, and the React tree that had
 * just lost its session carried straight into the next screen. `reload()`
 * after the assignment is what makes the promise true.
 *
 * The team's doors are still reached the way they always were — by typing
 * `#admin` or `#sales`, which is the only way in to them anyway.
 */
function toTheDoor(): void {
  /* Signing out ends the errand the kept route belonged to. Leaving it would
     send the NEXT person who signs in on this tab to a screen the previous
     one asked for (`auth/intended.ts`). */
  clearIntended()
  try {
    const door = window.location.pathname + window.location.search + R_LOGIN
    if (window.location.href.endsWith(door) || window.location.hash === R_LOGIN) {
      window.location.reload()
      return
    }
    window.location.href = door
    window.location.reload()
  } catch {
    /* no window (a test): nothing to navigate */
  }
}

export function SignOutButton({ className, label = 'Sign out' }: { className?: string; label?: string }) {
  const { signOut } = useAuth()
  const { t } = useI18n()
  return <button className={className} onClick={() => void signOut()}>{t(label)}</button>
}
