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

export function AuthProvider({ children }: { children: ReactNode }) {
  const supa = hasSupabaseEnv()
  const demoSession = supa ? null : readDemoUser()
  const [ready, setReady] = useState(!supa) // demo is ready immediately
  const [user, setUser] = useState<AuthUser | null>(demoSession)
  const [role, setRole] = useState<Role | null>(demoSession?.role ?? null)

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

  useEffect(() => {
    if (!supa) return
    const sb = getSupabaseClient(SB_URL as string, SB_KEY as string)
    let active = true

    /** The account's role, from its profile row. A missing row is not an error
        to throw at a person: it resolves to null, and the gate then says the
        account has no surface yet instead of showing a failure. */
    async function loadRole(uid: string): Promise<Role | null> {
      const { data, error } = await sb.from('profiles').select('role').eq('auth_uid', uid).maybeSingle()
      if (error) return null
      return ((data as { role?: Role } | null)?.role as Role | undefined) ?? null
    }

    async function apply(u: { id: string; email?: string } | undefined) {
      if (!u) {
        if (!active) return
        setUser(null); setRole(null); setReady(true)
        return
      }
      const r = await loadRole(u.id)
      if (!active) return
      setUser({ id: u.id, email: u.email ?? '' })
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
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => { void apply(session?.user) })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [supa])

  const api = useMemo<AuthApi>(() => {
    if (!supa) {
      /* Demo mode — any credentials work, and the DOOR decides the role. There
         is no profiles table to ask, and a demo where one sign-in opened all
         four surfaces would be a demo of the bug this gate exists to fix. */
      const enter = (email: string, r: Role) => {
        const u: DemoSession = { id: 'demo-' + (email || 'user'), email: email || 'demo@goodloop.app', role: r }
        try { localStorage.setItem(DEMO_KEY, JSON.stringify(u)) } catch { /* ignore */ }
        setUser({ id: u.id, email: u.email })
        setRole(r)
      }
      return {
        ready: true, user, role, mode: 'demo',
        async signIn(email, _password, r) { enter(email, r ?? 'b2c_user') },
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
        },
      }
    }
    const sb = getSupabaseClient(SB_URL as string, SB_KEY as string)
    return {
      ready, user, role, mode: 'supabase',
      async signIn(email, password) {
        const { error } = await sb.auth.signInWithPassword({ email, password })
        if (error) throw error
      },
      async signUp(email, password, role, extra) {
        const { data, error } = await sb.auth.signUp({ email, password })
        if (error) throw error
        const uid = data.user?.id
        if (!uid) throw new Error('Sign-up returned no user — turn off email confirmation while testing (see docs/AUTH_SETUP.md).')
        if (!data.session) throw new Error('Email confirmation is ON in Supabase, so this sign-up has no session yet. Disable it (Authentication → Sign In / Providers → Email → "Confirm email") and sign up again.')
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
          throw pErr
        }
        if (role === 'therapist') {
          const { data: prof, error: gErr } = await sb.from('profiles').select('id').eq('auth_uid', uid).single()
          if (gErr) throw gErr
          const { error: tErr } = await sb.from('therapists').insert({
            id: (prof as { id: string }).id, crp: extra?.crp ?? '', status: 'pending',
          })
          if (tErr) throw tErr
        }
        /* The row exists now. Remember it for a listener that already looked
           and found nothing, and set it directly for the case where no further
           listener runs at all. Both are needed: the two finish in either
           order, and only one of them can be last. */
        createdRole.current = role
        setRole(role)
      },
      async signOut() {
        createdRole.current = null
        await sb.auth.signOut()
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
export function SignOutButton({ className, label = 'Sign out' }: { className?: string; label?: string }) {
  const { signOut } = useAuth()
  const { t } = useI18n()
  return <button className={className} onClick={() => void signOut()}>{t(label)}</button>
}
