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
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getSupabaseClient, hasSupabaseEnv } from './supabaseClient'

export type Role = 'b2c_user' | 'therapist' | 'admin' | 'hr_admin'

export interface AuthUser { id: string; email: string }
export interface SignUpExtra { name?: string; crp?: string; companyId?: string; team?: string }

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
}

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
      setRole(r)
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
        async signUp(email, _password, r) { enter(email, r) },
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
        })
        if (pErr) {
          if ((pErr as { code?: string }).code === '23503')
            throw new Error('Unknown company code — ask HR for the right one.')
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
      },
      async signOut() { await sb.auth.signOut() },
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
