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
  error: string | null

  signIn: (email: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  hydrate: () => Promise<void>
}

// Resolve role + companyId from the `profiles` + `company_members` tables.
// Returns nulls if not yet provisioned. Service-role writes happen in Netlify
// Functions; this client reads what RLS exposes to the authenticated user.
async function resolveAppUser(u: User): Promise<AuthUser> {
  // Placeholder: real query lands in E4.x / E5.x once tables exist.
  return {
    id: u.id,
    email: u.email ?? null,
    role: null,
    companyId: null,
    fullName: (u.user_metadata?.full_name as string) ?? null,
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  session: null,
  user: null,
  loading: false,
  error: null,

  hydrate: async () => {
    set({ loading: true, error: null })
    const { data } = await supabase.auth.getSession()
    const session = data.session
    const user = session?.user ? await resolveAppUser(session.user) : null
    set({ session, user, loading: false })

    supabase.auth.onAuthStateChange(async (_evt, s) => {
      const u = s?.user ? await resolveAppUser(s.user) : null
      set({ session: s, user: u })
    })
  },

  signIn: async (email, password) => {
    set({ loading: true, error: null })
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      set({ loading: false, error: error.message })
      throw error
    }
    const u = data.user ? await resolveAppUser(data.user) : null
    set({ session: data.session, user: u, loading: false })
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ session: null, user: null })
  },
}))
