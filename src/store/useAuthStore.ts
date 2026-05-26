import { create } from 'zustand'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

export type AppRole =
  | 'super_admin'
  | 'company_owner'
  | 'company_admin'
  | 'employee'

export type AuthUser = {
  id: string
  email: string | null
  role: AppRole | null
  companyId: string | null
  fullName: string | null
}

type AuthState = {
  session: Session | null
  user: AuthUser | null
  loading: boolean
  hydrated: boolean
  error: string | null

  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  hydrate: () => Promise<void>
  // Auth-flow helpers (Brevo-wired)
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (newPassword: string) => Promise<void>
  sendMagicLink: (email: string) => Promise<void>
}

// Resolve role + companyId via the server (cf-me). Role resolution runs with the
// service role server-side, so the browser doesn't need RLS read access to
// cf_admins / company_users / employees. Falls back to nulls on any error.
async function resolveAppUser(u: User, accessToken: string): Promise<AuthUser> {
  const base: AuthUser = {
    id: u.id,
    email: u.email ?? null,
    role: null,
    companyId: null,
    fullName: (u.user_metadata?.full_name as string) ?? null,
  }
  try {
    const res = await fetch('/api/cf-me', {
      headers: { authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return base
    const me = await res.json()
    return {
      ...base,
      role: (me.role as AppRole | null) ?? null,
      companyId: (me.companyId as string | null) ?? null,
      fullName: (me.fullName as string | null) ?? base.fullName,
    }
  } catch {
    return base
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  user: null,
  // loading=true on boot so RoleGuard + LoginPage render a splash, not a
  // login form, while we resolve any URL-fragment magic-link / reset token.
  loading: true,
  hydrated: false,
  error: null,

  // Hydrate is idempotent — safe to call multiple times. The onAuthStateChange
  // subscription is installed only on the first call (tracked via `hydrated`).
  hydrate: async () => {
    if (get().hydrated) return
    set({ loading: true, error: null })
    try {
      const { data } = await supabase.auth.getSession()
      const session = data.session
      const user = session?.user
        ? await resolveAppUser(session.user, session.access_token)
        : null
      set({ session, user, loading: false, hydrated: true })

      // After initial hydrate, keep state in sync with SDK events (magic-link
      // arrivals, recovery sign-in, token refresh, sign-out from another tab).
      supabase.auth.onAuthStateChange(async (_evt, s) => {
        const u = s?.user ? await resolveAppUser(s.user, s.access_token) : null
        set({ session: s, user: u })
      })
    } catch {
      set({ loading: false, hydrated: true })
    }
  },

  signIn: async (email, password) => {
    set({ loading: true, error: null })
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      set({ loading: false, error: error.message })
      throw error
    }
    const u = data.user && data.session
      ? await resolveAppUser(data.user, data.session.access_token)
      : null
    set({ session: data.session, user: u, loading: false })
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, user: null })
  },

  // Send a recovery email. Supabase delivers via Brevo SMTP (verified 2026-05-26).
  // The email link lands on /reset-password where the user picks a new password.
  requestPasswordReset: async (email) => {
    set({ loading: true, error: null })
    const redirectTo = `${window.location.origin}/reset-password`
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
    if (error) { set({ loading: false, error: error.message }); throw error }
    set({ loading: false })
  },

  // Update the signed-in user's password (used right after they click the recovery
  // email — Supabase auto-signs them in via the token in the URL fragment).
  updatePassword: async (newPassword) => {
    set({ loading: true, error: null })
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) { set({ loading: false, error: error.message }); throw error }
    set({ loading: false })
  },

  // Passwordless sign-in. Brevo delivers the magic link.
  sendMagicLink: async (email) => {
    set({ loading: true, error: null })
    const emailRedirectTo = `${window.location.origin}/`
    const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo } })
    if (error) { set({ loading: false, error: error.message }); throw error }
    set({ loading: false })
  },
}))
