// cf-companies — list companies the caller can act on (for the switcher).
//
// GET /api/cf-companies  (Authorization: Bearer <access token>)
//   - super_admin  → all active companies
//   - company_admin → just their own company
//   - else → 403
//
// Returns { companies: [{ id, name }] }

import type { Context } from '@netlify/functions'
import { ok, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'GET') return methodNotAllowed(['GET'])
  try {
    const caller = await getCaller(req)
    if (!caller || (caller.role !== 'super_admin' && caller.role !== 'company_admin')) {
      return forbidden('Admins only')
    }
    const sb = supabaseAdmin()
    let q = sb.from('companies').select('id, name').eq('status', 'active').order('name')
    if (caller.role === 'company_admin' && caller.companyId) {
      q = q.eq('id', caller.companyId)
    }
    const { data, error } = await q
    if (error) throw new Error(`Failed to load companies: ${error.message}`)
    return ok({ companies: data ?? [] })
  } catch (e) {
    return errorResponse(e)
  }
}
