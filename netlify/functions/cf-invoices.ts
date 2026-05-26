// cf-invoices — derived monthly invoice view per (company × vendor).
//
// GET /api/cf-invoices?companyId=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// The invoice rows are computed live from orders (no separate invoices table
// yet — payment-tracking columns get added when we wire actual settlement).
// Each row = one (vendor × YYYY-MM) bucket, gross + benefit + extra, excluding
// cancelled orders. Status is "current" for the in-progress month, "open"
// otherwise.
//
// super_admin → any company; company_admin → own (companyId param ignored).

import type { Context } from '@netlify/functions'
import { ok, badRequest, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'

type Row = { company_id: string | null; vendor_id: string | null; subtotal: number; benefit_applied: number; topup_amount: number; delivery_date: string | null; status: string; vendors: { name: string | null } | null }

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
    const companyId = caller.role === 'company_admin' ? caller.companyId : url.searchParams.get('companyId')
    if (!companyId) return badRequest('companyId required')

    const sb = supabaseAdmin()
    const { data, error } = await sb.from('orders')
      .select('company_id, vendor_id, subtotal, benefit_applied, topup_amount, delivery_date, status, vendors(name)')
      .eq('company_id', companyId)
      .neq('status', 'cancelled')
      .gte('delivery_date', from)
      .lte('delivery_date', to)
      .limit(20000)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as Row[]

    const currentMonth = new Date().toISOString().slice(0, 7) // YYYY-MM
    type Bucket = { vendor_id: string | null; vendor_name: string; month: string; orders: number; gross: number; benefit: number; extra: number }
    const map = new Map<string, Bucket>()
    for (const r of rows) {
      if (!r.delivery_date) continue
      const month = r.delivery_date.slice(0, 7)
      const key = `${r.vendor_id ?? 'none'}::${month}`
      const bucket = map.get(key) ?? {
        vendor_id: r.vendor_id, vendor_name: r.vendors?.name ?? '—',
        month, orders: 0, gross: 0, benefit: 0, extra: 0,
      }
      bucket.orders += 1
      bucket.gross += r.subtotal
      bucket.benefit += r.benefit_applied
      bucket.extra += r.topup_amount
      map.set(key, bucket)
    }
    const invoices = [...map.values()]
      .map((b) => ({ ...b, status: b.month === currentMonth ? 'current' : 'open' }))
      .sort((a, b) => b.month.localeCompare(a.month) || a.vendor_name.localeCompare(b.vendor_name))

    // Totals on the visible window
    const totals = invoices.reduce(
      (acc, b) => ({ orders: acc.orders + b.orders, gross: acc.gross + b.gross, benefit: acc.benefit + b.benefit, extra: acc.extra + b.extra }),
      { orders: 0, gross: 0, benefit: 0, extra: 0 },
    )

    return ok({ period: { from, to }, totals, invoices })
  } catch (e) {
    return errorResponse(e)
  }
}
