// cf-dashboard — company dashboard metrics from the live orders mirror.
//
// GET /api/cf-dashboard?companyId=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD
//   (Authorization: Bearer <access token>)
//   - super_admin → any companyId (or all if omitted)
//   - company_admin → forced to own company
//
// Returns: { period, totals, trend[], byWeekday[], topUsers[], byVendor[] }

import type { Context } from '@netlify/functions'
import { ok, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'

type Row = {
  company_id: string | null
  employee_id: string | null
  voucher_code: string | null
  subtotal: number
  benefit_applied: number
  topup_amount: number
  delivery_date: string | null
  employees: { display_name: string | null } | null
  vendors: { name: string | null } | null
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'GET') return methodNotAllowed(['GET'])
  try {
    const caller = await getCaller(req)
    if (!caller || (caller.role !== 'super_admin' && caller.role !== 'company_admin')) {
      return forbidden('Admins only')
    }

    const url = new URL(req.url)
    const from = url.searchParams.get('from') || '2026-01-01'
    const to = url.searchParams.get('to') || new Date().toISOString().slice(0, 10)
    const companyId =
      caller.role === 'company_admin' ? caller.companyId : url.searchParams.get('companyId')

    const sb = supabaseAdmin()
    let q = sb
      .from('orders')
      .select(
        'company_id, employee_id, voucher_code, subtotal, benefit_applied, topup_amount, ' +
        'delivery_date, employees(display_name), vendors(name)',
      )
      .gte('delivery_date', from)
      .lte('delivery_date', to)
      .limit(10000)
    if (companyId) q = q.eq('company_id', companyId)

    const { data, error } = await q
    if (error) throw new Error(`Failed to load orders: ${error.message}`)
    const rows = (data ?? []) as unknown as Row[]

    const totals = { orders: 0, gross: 0, benefit: 0, topup: 0, employees: new Set<string>() }
    const trendMap = new Map<string, { date: string; gross: number; benefit: number; orders: number }>()
    const weekday = WEEKDAYS.map((d) => ({ day: d, orders: 0, gross: 0 }))
    const userMap = new Map<string, { name: string; orders: number; gross: number }>()
    const vendorMap = new Map<string, { vendor: string; orders: number; gross: number }>()

    for (const r of rows) {
      totals.orders += 1
      totals.gross += r.subtotal
      totals.benefit += r.benefit_applied
      totals.topup += r.topup_amount
      if (r.employee_id) totals.employees.add(r.employee_id)

      if (r.delivery_date) {
        const t = trendMap.get(r.delivery_date) ?? { date: r.delivery_date, gross: 0, benefit: 0, orders: 0 }
        t.gross += r.subtotal; t.benefit += r.benefit_applied; t.orders += 1
        trendMap.set(r.delivery_date, t)
        const wd = new Date(r.delivery_date + 'T00:00:00Z').getUTCDay()
        weekday[wd].orders += 1; weekday[wd].gross += r.subtotal
      }

      const uname = r.employees?.display_name ?? (r.voucher_code ?? '—')
      const ukey = (r.voucher_code ?? uname).toLowerCase()
      const u = userMap.get(ukey) ?? { name: uname, orders: 0, gross: 0 }
      u.orders += 1; u.gross += r.subtotal
      userMap.set(ukey, u)

      const vname = r.vendors?.name ?? '—'
      const v = vendorMap.get(vname) ?? { vendor: vname, orders: 0, gross: 0 }
      v.orders += 1; v.gross += r.subtotal
      vendorMap.set(vname, v)
    }

    const trend = [...trendMap.values()].sort((a, b) => a.date.localeCompare(b.date))
    const topUsers = [...userMap.values()].sort((a, b) => b.gross - a.gross).slice(0, 10)
    const byVendor = [...vendorMap.values()].sort((a, b) => b.gross - a.gross)

    return ok({
      period: { from, to },
      companyId: companyId ?? 'all',
      totals: {
        orders: totals.orders,
        gross: totals.gross,
        benefit: totals.benefit,
        topup: totals.topup,
        employees: totals.employees.size,
      },
      trend,
      byWeekday: weekday,
      topUsers,
      byVendor,
    })
  } catch (e) {
    return errorResponse(e)
  }
}
