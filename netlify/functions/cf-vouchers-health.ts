// cf-vouchers-health — live diff of GO vouchers vs CF benefit_assignments.
//
// GET /api/cf-vouchers-health?companyId=<uuid>
//
// For each active GO store this company is matched to, pulls the live
// voucher list and diffs against CF's active assignments by code. Returns:
//   { stores: [{ store_id, total_in_go, active_in_go, orphans (in GO, no
//     CF), missing (CF assignment, no GO voucher), stale (CF + GO but
//     expired endDate <= today), vouchers: [...slim list] }] }
//
// super_admin → any company; company_admin → own.

import type { Context } from '@netlify/functions'
import { ok, badRequest, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'
import { listVouchers } from './_shared/gonnaorder'

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'GET') return methodNotAllowed(['GET'])
  try {
    const caller = await getCaller(req)
    if (!caller || (caller.role !== 'super_admin' && caller.role !== 'company_admin')) {
      return forbidden('Admins only')
    }
    const url = new URL(req.url)
    const companyId = caller.role === 'company_admin' ? caller.companyId : url.searchParams.get('companyId')
    if (!companyId) return badRequest('companyId required')

    const sb = supabaseAdmin()

    // Stores this company is matched to
    const { data: ags } = await sb.from('matchmaking_agreements')
      .select('id, status, agreement_shops(gonnaorder_shop_id)')
      .eq('company_id', companyId).eq('status', 'active')
    const storeIds = ((ags ?? []) as Array<{ agreement_shops: { gonnaorder_shop_id: string }[] | null }>)
      .flatMap((a) => (a.agreement_shops ?? []).map((s) => s.gonnaorder_shop_id))
      .filter((v, i, arr) => v && arr.indexOf(v) === i)
    if (storeIds.length === 0) return ok({ stores: [] })

    // CF active assignments → voucher codes
    const { data: assigns } = await sb.from('benefit_assignments')
      .select('id, gonnaorder_voucher_code, ' +
              'benefits!inner(company_id), ' +
              'employees(display_name, status)')
      .is('unassigned_at', null)
    const allAssigns = (assigns ?? []) as unknown as Array<{ id: string; gonnaorder_voucher_code: string | null; benefits: { company_id: string } | null; employees: { display_name: string; status: string } | null }>
    const cfActive = allAssigns.filter((a) => a.benefits?.company_id === companyId)
    const cfCodeMap = new Map(cfActive.filter((a) => a.gonnaorder_voucher_code).map((a) => [a.gonnaorder_voucher_code as string, a]))

    const today = new Date().toISOString().slice(0, 10)
    const out: Array<Record<string, unknown>> = []
    for (const sid of storeIds) {
      const vouchers = await listVouchers(sid)
      type V = { id?: string; code?: string; isActive?: boolean; discount?: number; discountType?: string; type?: string; endDate?: string; initialValue?: number | null }
      const slim: V[] = vouchers.map((v) => ({
        id: String(v.id ?? ''), code: v.code, isActive: v.isActive, discount: v.discount,
        discountType: v.discountType, type: v.type, endDate: v.endDate, initialValue: v.initialValue ?? null,
      }))
      const goCodes = new Set(slim.map((v) => v.code).filter((c): c is string => Boolean(c)))
      const orphans = slim.filter((v) => v.code && !cfCodeMap.has(v.code))     // in GO, no CF assignment
      const missing = [...cfCodeMap.values()].filter((a) => !goCodes.has(a.gonnaorder_voucher_code as string))   // CF assignment, no GO voucher
      const stale = slim.filter((v) => v.endDate && v.endDate.slice(0, 10) <= today)
      out.push({
        store_id: sid,
        total_in_go: slim.length,
        active_in_go: slim.filter((v) => v.isActive).length,
        cf_active: cfActive.length,
        orphans: orphans.slice(0, 50),
        missing: missing.slice(0, 50).map((a) => ({ assignment_id: a.id, voucher_code: a.gonnaorder_voucher_code, employee: a.employees?.display_name ?? null })),
        stale: stale.slice(0, 50),
        vouchers: slim,
      })
    }
    return ok({ stores: out })
  } catch (e) { return errorResponse(e) }
}
