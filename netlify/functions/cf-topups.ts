// cf-topups — manual entry point + GET history list.
//
//   POST /api/cf-topups   header: x-cf-admin-token: <CF_ADMIN_TOKEN>
//     body: { dryRun?, assignmentId?, employeeId?, benefitId? }
//   GET  /api/cf-topups?companyId=&limit=N   (Authorization: Bearer)
//     → list recent benefit_topups rows for the Topups history page
//
// Core work lives in _shared/topups.ts (shared with cf-topups-cron).

import type { Context } from '@netlify/functions'
import { ok, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'
import { runTopups } from './_shared/topups'

export default async (req: Request, _ctx: Context) => {
  // GET: list recent top-up runs (Authorization: Bearer for admins)
  if (req.method === 'GET') {
    try {
      const caller = await getCaller(req)
      if (!caller || (caller.role !== 'super_admin' && caller.role !== 'company_admin')) {
        return forbidden('Admins only')
      }
      const url = new URL(req.url)
      const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? 100)))
      const companyId = caller.role === 'company_admin' ? caller.companyId : url.searchParams.get('companyId')
      const sb = supabaseAdmin()
      const { data, error } = await sb.from('benefit_topups')
        .select('id, assignment_id, benefit_id, employee_id, scheduled_for, status, amount, ' +
                'gonnaorder_voucher_code, applied_at, error_detail, ' +
                'benefits(name_el, name_en, company_id), employees(display_name)')
        .order('applied_at', { ascending: false, nullsFirst: false })
        .limit(limit)
      if (error) throw new Error(error.message)
      const rows = (data ?? []) as unknown as Array<Record<string, unknown> & { benefits: { name_el: string; name_en: string; company_id: string } | null }>
      const filtered = companyId ? rows.filter((r) => r.benefits?.company_id === companyId) : rows
      return ok({ topups: filtered })
    } catch (e) { return errorResponse(e) }
  }

  if (req.method !== 'POST') return methodNotAllowed(['GET', 'POST'])
  const expected = process.env.CF_ADMIN_TOKEN
  const got = req.headers.get('x-cf-admin-token') ?? req.headers.get('X-CF-Admin-Token')
  if (!expected || got !== expected) return forbidden('admin token required')

  try {
    const b = (await req.json().catch(() => ({}))) as {
      dryRun?: boolean; assignmentId?: string; employeeId?: string; benefitId?: string
    }
    const result = await runTopups(b)
    return ok(result)
  } catch (e) { return errorResponse(e) }
}
