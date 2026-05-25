// cf-me — returns the authenticated caller's resolved CF identity.
//
// GET /api/cf-me  (Authorization: Bearer <supabase access token>)
// → { authenticated, role, companyId, employeeId, fullName, email }
//
// The browser calls this after login so it knows the user's role + tenant
// (resolution happens server-side via the service role, so the client doesn't
// need RLS read access to cf_admins / company_users / employees).

import type { Context } from '@netlify/functions'
import { ok, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'GET') return methodNotAllowed(['GET'])
  try {
    const caller = await getCaller(req)
    if (!caller) {
      return ok({ authenticated: false, role: null, companyId: null, employeeId: null })
    }
    return ok({
      authenticated: true,
      role: caller.role,
      companyId: caller.companyId,
      employeeId: caller.employeeId,
      fullName: caller.fullName,
      email: caller.user.email ?? null,
    })
  } catch (e) {
    return errorResponse(e)
  }
}
