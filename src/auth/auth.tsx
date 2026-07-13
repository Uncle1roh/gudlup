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
export interface SignUpExtra { name?: string; crp?: string }

export interface AuthApi {
  ready: boolean
  user: AuthUser | null
  mode: 'demo' | 'supabase'
  signIn(email: string, password: string): Promise<void>
  signUp(email: string, password: string, role: Role, extra?: SignUpExtra): Promise<void>
  signOut(): Promise<void>
}

const AuthCtx = createContext<AuthApi | null>(null)

const SB_URL = import.meta.env.VITE_SUPABASE_URL
const SB_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

/* Demo mode keeps a local "session" in localStorage so the login is real-feeling
   and survives refreshes during a demo — no backend required. */
const DEMO_KEY = 'gl-demo-session'
function readDemoUser(): AuthUser | null {
  try { const s = localStorage.getItem(DEMO_KEY); return s ? (JSON.parse(s) as AuthUser) : null } catch { return null }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const supa = hasSupabaseEnv()
  const [ready, setReady] = useState(!supa) // demo is ready immediately
  const [user, setUser] = useState<AuthUser | null>(supa ? null : readDemoUser())

  useEffect(() => {
    if (!supa) return
    const sb = getSupabaseClient(SB_URL as string, SB_KEY as string)
    let active = true
    void sb.auth.getSession().then(({ data }) => {
      if (!active) return
      const u = data.session?.user
      setUser(u ? { id: u.id, email: u.email ?? '' } : null)
      setReady(true)
    })
    const { data: sub } = sb.auth.onAuthStateChange((_event, session) => {
      const u = session?.user
      setUser(u ? { id: u.id, email: u.email ?? '' } : null)
    })
    return () => { active = false; sub.subscription.unsubscribe() }
  }, [supa])

  const api = useMemo<AuthApi>(() => {
    if (!supa) {
      // demo mode — accept any credentials, persist locally
      const enter = (email: string) => {
        const u: AuthUser = { id: 'demo-' + (email || 'user'), email: email || 'demo@goodloop.app' }
        try { localStorage.setItem(DEMO_KEY, JSON.stringify(u)) } catch { /* ignore */ }
        setUser(u)
      }
      return {
        ready: true, user, mode: 'demo',
        async signIn(email) { enter(email) },
        async signUp(email) { enter(email) },
        async signOut() { try { localStorage.removeItem(DEMO_KEY) } catch { /* ignore */ } setUser(null) },
      }
    }
    const sb = getSupabaseClient(SB_URL as string, SB_KEY as string)
    return {
      ready, user, mode: 'supabase',
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
        })
        if (pErr) throw pErr
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
    }
  }, [supa, ready, user])

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
