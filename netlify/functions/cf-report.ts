// cf-report — aggregated orders report for the admin UI.
//
// GET /api/cf-report?from=YYYY-MM-DD&to=YYYY-MM-DD&companyId=<uuid>
//   (Authorization: Bearer <supabase access token>)
//
// Authz:
//   - super_admin  → sees all companies (optionally filtered by ?companyId)
//   - company_admin → forced to their own company (companyId param ignored)
//   - anyone else  → 403
//
// Returns aggregated cuts the UI renders directly:
//   { period, scope, totals, perCompany, perEmployee, perDay, orders }
//
// Service-role read (bypasses RLS); authz enforced here via getCaller.

import type { Context } from '@netlify/functions'
import { ok, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'

type OrderRow = {
  external_order_id: string
  order_token: string | null
  voucher_code: string | null
  company_id: string | null
  employee_id: string | null
  subtotal: number
  benefit_applied: number
  topup_amount: number
  total: number
  delivery_date: string | null
  status: string
  placed_at: string
  employees: { display_name: string | null; external_ref: string | null } | null
  companies: { name: string | null } | null
  vendors: { discount_percentage: number | string | null; discount_applies_to: string | null } | null
}

// CF-97: apply vendor discount to a benefit amount when applies_to='benefit_price'.
function netBenefit(benefitCents: number, pct: number | string | null | undefined, appliesTo: string | null): number {
  const p = pct == null ? 0 : Number(pct)
  if (!Number.isFinite(p) || p <= 0) return benefitCents
  if (appliesTo !== 'benefit_price') return benefitCents
  const discount = Math.round((benefitCents * p) / 100)
  return benefitCents - discount
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'GET') return methodNotAllowed(['GET'])
  try {
    const caller = await getCaller(req)
    if (!caller || (caller.role !== 'super_admin' && caller.role !== 'company_admin')) {
      return forbidden('Reports are available to admins only')
    }

    const url = new URL(req.url)
    const from = url.searchParams.get('from') || '2026-01-01'
    const to = url.searchParams.get('to') || isoToday()

    // Scope: super_admin can filter by companyId; company_admin is locked to own company.
    let scopeCompanyId: string | null = null
    if (caller.role === 'company_admin') {
      scopeCompanyId = caller.companyId
    } else {
      scopeCompanyId = url.searchParams.get('companyId')
    }

    const sb = supabaseAdmin()
    let q = sb
      .from('orders')
      .select(
        'external_order_id, order_token, voucher_code, company_id, employee_id, ' +
        'subtotal, benefit_applied, topup_amount, total, delivery_date, status, placed_at, ' +
        'employees(display_name, external_ref), companies(name), ' +
        'vendors(discount_percentage, discount_applies_to)',
      )
      .gte('delivery_date', from)
      .lte('delivery_date', to)
      .order('placed_at', { ascending: false })
      .limit(5000)

    if (scopeCompanyId) q = q.eq('company_id', scopeCompanyId)

    const { data, error } = await q
    if (error) throw new Error(`Failed to load orders: ${error.message}`)
    const rows = (data ?? []) as unknown as OrderRow[]

    // ---- aggregate ----
    // CF-97: `benefit` keeps meaning gross (no breaking changes for legacy
    // callers); `net_benefit` is the post-discount amount the company actually
    // owes the vendor. Discount is applied PER ROW using that row's vendor,
    // so per-day totals stay accurate even when companies use multiple vendors.
    const totals = { orders: 0, gross: 0, benefit: 0, net_benefit: 0, topup: 0 }
    const byCompany = new Map<string, { company: string; orders: number; employees: Set<string>; gross: number; benefit: number; net_benefit: number; topup: number }>()
    const byEmployee = new Map<string, { company: string; name: string; voucher: string; orders: number; gross: number; benefit: number; net_benefit: number; topup: number }>()
    const byDay = new Map<string, { date: string; orders: number; employees: Set<string>; gross: number; benefit: number; net_benefit: number; topup: number }>()

    for (const r of rows) {
      const rowNet = netBenefit(r.benefit_applied, r.vendors?.discount_percentage ?? null, r.vendors?.discount_applies_to ?? null)

      totals.orders += 1
      totals.gross += r.subtotal
      totals.benefit += r.benefit_applied
      totals.net_benefit += rowNet
      totals.topup += r.topup_amount

      const companyName = r.companies?.name ?? '— unknown —'
      const empName = r.employees?.display_name ?? (r.voucher_code ?? '— unmatched —')
      const voucher = r.voucher_code ?? '—'

      const cKey = r.company_id ?? 'none'
      const c = byCompany.get(cKey) ?? { company: companyName, orders: 0, employees: new Set<string>(), gross: 0, benefit: 0, net_benefit: 0, topup: 0 }
      c.orders += 1; c.gross += r.subtotal; c.benefit += r.benefit_applied; c.net_benefit += rowNet; c.topup += r.topup_amount
      if (r.employee_id) c.employees.add(r.employee_id)
      byCompany.set(cKey, c)

      const eKey = `${cKey}::${(voucher).toLowerCase()}`
      const e = byEmployee.get(eKey) ?? { company: companyName, name: empName, voucher, orders: 0, gross: 0, benefit: 0, net_benefit: 0, topup: 0 }
      e.orders += 1; e.gross += r.subtotal; e.benefit += r.benefit_applied; e.net_benefit += rowNet; e.topup += r.topup_amount
      byEmployee.set(eKey, e)

      if (r.delivery_date) {
        const d = byDay.get(r.delivery_date) ?? { date: r.delivery_date, orders: 0, employees: new Set<string>(), gross: 0, benefit: 0, net_benefit: 0, topup: 0 }
        d.orders += 1; d.gross += r.subtotal; d.benefit += r.benefit_applied; d.net_benefit += rowNet; d.topup += r.topup_amount
        if (r.employee_id) d.employees.add(r.employee_id)
        byDay.set(r.delivery_date, d)
      }
    }

    const perCompany = [...byCompany.values()]
      .map((c) => ({ company: c.company, orders: c.orders, employees: c.employees.size, gross: c.gross, benefit: c.benefit, net_benefit: c.net_benefit, topup: c.topup }))
      .sort((a, b) => b.gross - a.gross)

    const perEmployee = [...byEmployee.values()]
      .sort((a, b) => (a.company.localeCompare(b.company)) || (b.gross - a.gross))

    const perDay = [...byDay.values()]
      .map((d) => ({ date: d.date, orders: d.orders, employees: d.employees.size, gross: d.gross, benefit: d.benefit, net_benefit: d.net_benefit, topup: d.topup }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const orders = rows.slice(0, 500).map((r) => ({
      date: r.delivery_date,
      token: r.order_token,
      voucher: r.voucher_code,
      employee: r.employees?.display_name ?? null,
      company: r.companies?.name ?? null,
      gross: r.subtotal,
      benefit: r.benefit_applied,
      net_benefit: netBenefit(r.benefit_applied, r.vendors?.discount_percentage ?? null, r.vendors?.discount_applies_to ?? null),
      topup: r.topup_amount,
      status: r.status,
    }))

    return ok({
      scope: caller.role === 'company_admin' ? caller.companyId : (scopeCompanyId ?? 'all'),
      role: caller.role,
      period: { from, to },
      totals,
      perCompany,
      perEmployee,
      perDay,
      orders,
      orderCountTotal: rows.length,
    })
  } catch (e) {
    return errorResponse(e)
  }
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}
