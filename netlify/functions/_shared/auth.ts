import type { User } from '@supabase/supabase-js'
import { supabaseAdmin } from './supabaseAdmin'

export type ResolvedUser = {
  user: User
  role: 'super_admin' | 'company_owner' | 'company_admin' | 'employee' | null
  companyId: string | null
}

/**
 * Resolve the caller from an Authorization: Bearer <jwt> header.
 *
 * Returns null if there's no token or the token is invalid. Also resolves
 * the caller's app role + companyId from `profiles` / `company_members`
 * once those tables exist (currently stubbed to null — will be filled in
 * during E2 migrations).
 */
export async function getCaller(req: Request): Promise<ResolvedUser | null> {
  const auth = req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!auth?.toLowerCase().startsWith('bearer ')) return null
  const token = auth.slice(7).trim()
  if (!token) return null

  const sb = supabaseAdmin()
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data.user) return null

  // Placeholder — real role/company lookup lands with E2 tables.
  return {
    user: data.user,
    role: null,
    companyId: null,
  }
}

export function requireRole(
  caller: ResolvedUser | null,
  allow: Array<NonNullable<ResolvedUser['role']>>,
): caller is ResolvedUser & { role: NonNullable<ResolvedUser['role']> } {
  return !!caller && !!caller.role && allow.includes(caller.role)
}
