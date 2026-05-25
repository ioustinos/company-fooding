import type { User } from '@supabase/supabase-js'
import { supabaseAdmin } from './supabaseAdmin'

export type AppRole = 'super_admin' | 'company_owner' | 'company_admin' | 'employee'

export type ResolvedUser = {
  user: User
  role: AppRole | null
  companyId: string | null
  employeeId: string | null
  fullName: string | null
}

/**
 * Resolve the caller from an Authorization: Bearer <jwt> header.
 *
 * Returns null if there's no token or the token is invalid. Otherwise resolves
 * the caller's app role + tenant context by querying (in priority order):
 *   1. cf_admins      → super_admin
 *   2. company_users  → company_admin (+ companyId)
 *   3. employees      → employee (+ companyId, employeeId)
 *
 * Uses the service-role client so it isn't blocked by RLS. This is the single
 * source of truth for "who is calling" across all CF functions.
 */
export async function getCaller(req: Request): Promise<ResolvedUser | null> {
  const auth = req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!auth?.toLowerCase().startsWith('bearer ')) return null
  const token = auth.slice(7).trim()
  if (!token) return null

  const sb = supabaseAdmin()
  const { data, error } = await sb.auth.getUser(token)
  if (error || !data.user) return null
  const user = data.user

  const fullName = (user.user_metadata?.full_name as string) ?? null

  // 1. CF admin (platform super admin)?
  const { data: cfAdmin } = await sb
    .from('cf_admins')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (cfAdmin) {
    return { user, role: 'super_admin', companyId: null, employeeId: null, fullName }
  }

  // 2. Company admin?
  const { data: companyUser } = await sb
    .from('company_users')
    .select('company_id, role, status')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()
  if (companyUser) {
    return {
      user,
      role: 'company_admin',
      companyId: companyUser.company_id as string,
      employeeId: null,
      fullName,
    }
  }

  // 3. Employee?
  const { data: employee } = await sb
    .from('employees')
    .select('id, company_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (employee) {
    return {
      user,
      role: 'employee',
      companyId: employee.company_id as string,
      employeeId: employee.id as string,
      fullName,
    }
  }

  // Authenticated but unprovisioned — no CF role yet.
  return { user, role: null, companyId: null, employeeId: null, fullName }
}

export function requireRole(
  caller: ResolvedUser | null,
  allow: AppRole[],
): caller is ResolvedUser & { role: AppRole } {
  return !!caller && !!caller.role && allow.includes(caller.role)
}
