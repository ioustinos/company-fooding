// cf-reconcile — diff CF orders vs GonnaOrder orders for a (company × period).
// Catches dropped webhooks (in GO, not in CF), bogus CF rows (in CF, not in GO),
// and amount mismatches.
//
// GET /api/cf-reconcile?companyId=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD
//   defaults: from = today-7d, to = today
//
// super_admin → any company; company_admin → own (companyId param ignored).

import type { Context } from '@netlify/functions'
import { ok, badRequest, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'
import { listOrders } from './_shared/gonnaorder'

type CfOrder = { external_order_id: string; subtotal: number; benefit_applied: number; status: string; delivery_date: string | null }

const cents = (eur: unknown) => {
  const n = typeof eur === 'number' ? eur : Number(eur)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'GET') return methodNotAllowed(['GET'])
  try {
    const caller = await getCaller(req)
    if (!caller || (caller.role !== 'super_admin' && caller.role !== 'company_admin')) {
      return forbidden('Admins only')
    }
    const url = new URL(req.url)
    const today = new Date(); const t = today.toISOString().slice(0, 10)
    const past = new Date(today); past.setDate(past.getDate() - 7); const p = past.toISOString().slice(0, 10)
    const from = url.searchParams.get('from') || p
    const to = url.searchParams.get('to') || t
    const companyId = caller.role === 'company_admin' ? caller.companyId : url.searchParams.get('companyId')
    if (!companyId) return badRequest('companyId required')

    const sb = supabaseAdmin()

    // Find the company's active GO shop ids
    const { data: ags } = await sb.from('matchmaking_agreements')
      .select('id, status, agreement_shops(gonnaorder_shop_id)')
      .eq('company_id', companyId).eq('status', 'active')
    const storeIds = ((ags ?? []) as Array<{ agreement_shops: { gonnaorder_shop_id: string }[] | null }>)
      .flatMap((a) => (a.agreement_shops ?? []).map((s) => s.gonnaorder_shop_id))
      .filter((v, i, arr) => v && arr.indexOf(v) === i)
    if (storeIds.length === 0) return badRequest('no GO shops for this company')

    // CF side
    const { data: cfRows } = await sb.from('orders')
      .select('external_order_id, subtotal, benefit_applied, status, delivery_date')
      .eq('company_id', companyId)
      .gte('delivery_date', from)
      .lte('delivery_date', to)
      .limit(20000)
    const cfMap = new Map<string, CfOrder>()
    for (const r of (cfRows ?? []) as CfOrder[]) cfMap.set(r.external_order_id, r)

    // GO side — pull all orders since `from` for each store, in-window filter below
    const since = new Date(from + 'T00:00:00Z')
    const goAll: Array<{ id: string; subtotal_cents: number; benefit_cents: number; date: string | null; status: string }> = []
    for (const sid of storeIds) {
      const orders = await listOrders({ storeId: sid, since, status: [], pageSize: 100 })
      for (const o of orders) {
        const id = String(o.uuid ?? o.orderId ?? '')
        if (!id) continue
        // wishTime is an ISO string in the search response; clip to date
        const dateRaw = typeof o.wishTime === 'string' ? o.wishTime.slice(0, 10) : null
        if (dateRaw && (dateRaw < from || dateRaw > to)) continue
        goAll.push({
          id,
          subtotal_cents: cents(o.totalNonDiscountedPrice),
          benefit_cents: cents(o.voucherDiscount),
          date: dateRaw,
          status: String(o.status ?? '').toUpperCase(),
        })
      }
    }
    const goMap = new Map(goAll.map((o) => [o.id, o]))

    // Compute diffs
    const missingInCf: typeof goAll = []
    const missingInGo: CfOrder[] = []
    const mismatches: Array<{ id: string; cf: CfOrder; go: typeof goAll[number]; subtotal_delta: number; benefit_delta: number }> = []

    for (const g of goAll) {
      const c = cfMap.get(g.id)
      if (!c) { missingInCf.push(g); continue }
      const sd = c.subtotal - g.subtotal_cents
      const bd = c.benefit_applied - g.benefit_cents
      if (sd !== 0 || bd !== 0) mismatches.push({ id: g.id, cf: c, go: g, subtotal_delta: sd, benefit_delta: bd })
    }
    for (const [id, c] of cfMap) if (!goMap.has(id)) missingInGo.push(c)

    return ok({
      period: { from, to },
      storeIds,
      counts: { cf: cfMap.size, go: goAll.length, missingInCf: missingInCf.length, missingInGo: missingInGo.length, mismatches: mismatches.length },
      missingInCf: missingInCf.slice(0, 100),
      missingInGo: missingInGo.slice(0, 100),
      mismatches: mismatches.slice(0, 100),
    })
  } catch (e) {
    return errorResponse(e)
  }
}
