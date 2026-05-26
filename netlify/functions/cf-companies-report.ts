// cf-companies-report — super-admin only. One row per company with key KPIs
// over a date range, for the comparison page.
//
// GET /api/cf-companies-report?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Returns: [{ company_id, name, employees_active, benefits_active, orders,
//             gross, benefit, extra, benefit_pct, last_order_at,
//             last_topup_at, topup_failed }]

import type { Context } from '@netlify/functions'
import { ok, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'GET') return methodNotAllowed(['GET'])
  try {
    const caller = await getCaller(req)
    if (!caller || caller.role !== 'super_admin') return forbidden('super_admin only')

    const url = new URL(req.url)
    const from = url.searchParams.get('from') || '2026-01-01'
    const to = url.searchParams.get('to') || new Date().toISOString().slice(0, 10)
    const sb = supabaseAdmin()

    const { data: companies } = await sb.from('companies').select('id, name, status').order('name')
    const list = (companies ?? []) as Array<{ id: string; name: string; status: string }>

    const rows: Array<Record<string, unknown>> = []
    for (const c of list) {
      const [empsR, bensR, ordersR, topupsR] = await Promise.all([
        sb.from('employees').select('id', { count: 'exact', head: true }).eq('company_id', c.id).eq('status', 'active'),
        sb.from('benefits').select('id', { count: 'exact', head: true }).eq('company_id', c.id).eq('status', 'active'),
        sb.from('orders')
          .select('subtotal, benefit_applied, topup_amount, delivery_date, status')
          .eq('company_id', c.id).gte('delivery_date', from).lte('delivery_date', to)
          .limit(20000),
        sb.from('benefit_topups').select('status, applied_at, benefits!inner(company_id)')
          .eq('benefits.company_id', c.id)
          .order('applied_at', { ascending: false }).limit(200),
      ])
      const ordersAll = (ordersR.data ?? []) as Array<{ subtotal: number; benefit_applied: number; topup_amount: number; delivery_date: string | null; status: string }>
      const orders = ordersAll.filter((o) => o.status !== 'cancelled')
      const totals = orders.reduce((a, o) => ({
        orders: a.orders + 1,
        gross: a.gross + o.subtotal,
        benefit: a.benefit + o.benefit_applied,
        extra: a.extra + o.topup_amount,
      }), { orders: 0, gross: 0, benefit: 0, extra: 0 })
      const lastOrder = orders
        .filter((o) => o.delivery_date)
        .sort((a, b) => (b.delivery_date ?? '').localeCompare(a.delivery_date ?? ''))[0]
      const topups = (topupsR.data ?? []) as Array<{ status: string; applied_at: string | null }>
      const lastTopup = topups.find((t) => t.applied_at)?.applied_at ?? null
      const topupFailed = topups.filter((t) => t.status === 'failed').length

      rows.push({
        company_id: c.id, name: c.name, status: c.status,
        employees_active: empsR.count ?? 0,
        benefits_active: bensR.count ?? 0,
        orders: totals.orders,
        gross: totals.gross,
        benefit: totals.benefit,
        extra: totals.extra,
        benefit_pct: totals.gross > 0 ? Math.round((totals.benefit / totals.gross) * 100) : 0,
        last_order_at: lastOrder?.delivery_date ?? null,
        last_topup_at: lastTopup,
        topup_failed: topupFailed,
      })
    }
    return ok({ period: { from, to }, companies: rows })
  } catch (e) { return errorResponse(e) }
}
