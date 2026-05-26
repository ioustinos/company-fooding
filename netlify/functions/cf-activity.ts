// cf-activity — list company activity events for the Dashboard widget +
// dedicated /company/activity page.
//
// GET /api/cf-activity?companyId=<uuid>&limit=20
//
// company_admin sees own company; super_admin sees all (or filtered).
// Returns the most recent N events newest-first.

import type { Context } from '@netlify/functions'
import { ok, badRequest, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'GET') return methodNotAllowed(['GET'])
  try {
    const caller = await getCaller(req)
    if (!caller || (caller.role !== 'super_admin' && caller.role !== 'company_admin')) {
      return forbidden('Admins only')
    }
    const url = new URL(req.url)
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 20)))
    const companyId = caller.role === 'company_admin' ? caller.companyId : url.searchParams.get('companyId')
    if (caller.role === 'company_admin' && !companyId) return badRequest('companyId required')

    const sb = supabaseAdmin()
    let q = sb.from('activity_events')
      .select('id, company_id, actor_email, kind, target_type, target_id, summary_el, summary_en, payload, created_at')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (companyId) q = q.eq('company_id', companyId)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    return ok({ events: data ?? [] })
  } catch (e) {
    return errorResponse(e)
  }
}
