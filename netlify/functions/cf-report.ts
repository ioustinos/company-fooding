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
// Billing follows each deal's dated rules (public.deal_rules) via
// _shared/dealRulesCore.ts: benefit-invoice discount → net, minimum commitment →
// billed = max(minimum, net) per period. Vendor loyalty / vendor discount are
// split per order at sync time (orders.vendor_loyalty / vendor_discount).
//
// Service-role read (bypasses RLS); authz enforced here via getCaller.

import type { Context } from '@netlify/functions'
import { ok, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'
import { activeOn, computeInvoice, type DealRule } from './_shared/dealRulesCore'
import { loadBenefitCaps, loadCalendar, loadRules } from './_shared/dealRules'

type OrderRow = {
  external_order_id: string
  order_token: string | null
  voucher_code: string | null
  company_id: string | null
  employee_id: string | null
  agreement_id: string | null
  subtotal: number
  benefit_applied: number
  vendor_loyalty: number
  vendor_discount: number
  topup_amount: number
  total: number
  delivery_date: string | null
  status: string
  placed_at: string
  employees: { display_name: string | null; external_ref: string | null } | null
  companies: { name: string | null } | null
}

// Per-row view of the benefit-invoice discount (for row/employee tables).
// Company and day totals come from computeInvoice, which is authoritative.
function rowDiscount(benefit: number, date: string | null, rules: DealRule[]): number {
  if (!date || benefit <= 0) return 0
  const r = rules.find((x) => x.kind === 'benefit_invoice_discount' && activeOn(x, date))
  if (!r) return 0
  if (r.percent != null) return Math.round((benefit * Number(r.percent)) / 100)
  if (r.amount_unit === 'per_order') return Math.min(benefit, r.amount_cents ?? 0)
  return 0 // per_benefit_day: only meaningful aggregated per day
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
        'external_order_id, order_token, voucher_code, company_id, employee_id, agreement_id, ' +
        'subtotal, benefit_applied, vendor_loyalty, vendor_discount, topup_amount, total, delivery_date, status, placed_at, ' +
        'employees(display_name, external_ref), companies(name)',
      )
      .gte('delivery_date', from)
      .lte('delivery_date', to)
      .order('placed_at', { ascending: false })
      .limit(5000)

    if (scopeCompanyId) q = q.eq('company_id', scopeCompanyId)

    const { data, error } = await q
    if (error) throw new Error(`Failed to load orders: ${error.message}`)
    const rows = (data ?? []) as unknown as OrderRow[]

    // Deal rules for every deal in the result.
    const agreementIds = [...new Set(rows.map((r) => r.agreement_id).filter((x): x is string => !!x))]
    const companyIds = [...new Set(rows.map((r) => r.company_id).filter((x): x is string => !!x))]
    const [rulesByAgreement, caps] = await Promise.all([loadRules(sb, agreementIds), loadBenefitCaps(sb, companyIds)])
    const rulesFor = (agreementId: string | null) => (agreementId ? rulesByAgreement.get(agreementId) ?? [] : [])

    // ---- aggregate ----
    // `benefit` = company benefit (already capped; vendor loyalty excluded).
    // `net_benefit` = benefit − benefit-invoice discount (per the deal's rules).
    // `billed` = what the company owes incl. any minimum-commitment top-up.
    const totals = { orders: 0, gross: 0, benefit: 0, net_benefit: 0, topup: 0, loyalty: 0, vendor_discount: 0, billed: 0, min_topup: 0 }
    type Agg = { orders: number; gross: number; benefit: number; net_benefit: number; topup: number; loyalty: number; vendor_discount: number }
    const zero = (): Agg => ({ orders: 0, gross: 0, benefit: 0, net_benefit: 0, topup: 0, loyalty: 0, vendor_discount: 0 })
    const add = (a: Agg, r: OrderRow, net: number) => {
      a.orders += 1; a.gross += r.subtotal; a.benefit += r.benefit_applied; a.net_benefit += net
      a.topup += r.topup_amount; a.loyalty += r.vendor_loyalty ?? 0; a.vendor_discount += r.vendor_discount ?? 0
    }
    const byCompany = new Map<string, Agg & { company: string; employees: Set<string> }>()
    const byEmployee = new Map<string, Agg & { company: string; name: string; voucher: string }>()
    const byDay = new Map<string, Agg & { date: string; employees: Set<string> }>()
    // deal → its orders, for computeInvoice
    const byDeal = new Map<string, { companyId: string; orders: { delivery_date: string; benefit_applied: number; employee_id: string | null; cancelled: boolean }[] }>()

    for (const r of rows) {
      const net = r.benefit_applied - rowDiscount(r.benefit_applied, r.delivery_date, rulesFor(r.agreement_id))
      const companyName = r.companies?.name ?? '— unknown —'
      const voucher = r.voucher_code ?? '—'
      const cKey = r.company_id ?? 'none'

      totals.orders += 1; totals.gross += r.subtotal; totals.benefit += r.benefit_applied
      totals.topup += r.topup_amount; totals.loyalty += r.vendor_loyalty ?? 0; totals.vendor_discount += r.vendor_discount ?? 0

      const c = byCompany.get(cKey) ?? { ...zero(), company: companyName, employees: new Set<string>() }
      add(c, r, net); if (r.employee_id) c.employees.add(r.employee_id)
      byCompany.set(cKey, c)

      const eKey = `${cKey}::${voucher.toLowerCase()}`
      const e = byEmployee.get(eKey) ?? { ...zero(), company: companyName, name: r.employees?.display_name ?? (r.voucher_code ?? '— unmatched —'), voucher }
      add(e, r, net)
      byEmployee.set(eKey, e)

      if (r.delivery_date) {
        const d = byDay.get(r.delivery_date) ?? { ...zero(), date: r.delivery_date, employees: new Set<string>() }
        add(d, r, net); if (r.employee_id) d.employees.add(r.employee_id)
        byDay.set(r.delivery_date, d)
      }

      if (r.delivery_date && r.agreement_id && r.company_id) {
        const deal = byDeal.get(r.agreement_id) ?? { companyId: r.company_id, orders: [] }
        deal.orders.push({ delivery_date: r.delivery_date, benefit_applied: r.benefit_applied, employee_id: r.employee_id, cancelled: r.status === 'cancelled' })
        byDeal.set(r.agreement_id, deal)
      }
    }

    // Authoritative billing per deal (discount + minimum commitment, dated rules).
    const billedByCompany = new Map<string, { net: number; billed: number; min_topup: number; periods: number; minimum_label: string | null }>()
    const billedByDay = new Map<string, { billed: number; min_topup: number }>()
    for (const [agreementId, deal] of byDeal) {
      const rules = rulesFor(agreementId)
      const needsCalendar = rules.some((x) => x.kind === 'minimum_commitment' && x.counts_on !== 'days_with_orders')
      const calendar = needsCalendar ? await loadCalendar(sb, deal.companyId, from, to) : undefined
      const inv = computeInvoice({ orders: deal.orders, rules, caps, companyId: deal.companyId, from, to, calendar })
      const bc = billedByCompany.get(deal.companyId) ?? { net: 0, billed: 0, min_topup: 0, periods: 0, minimum_label: null }
      bc.net += inv.net; bc.billed += inv.billed; bc.min_topup += inv.minimum_topup; bc.periods += inv.periods.length
      const minRule = rules.find((x) => x.kind === 'minimum_commitment' && x.valid_from <= to && (!x.valid_to || x.valid_to >= from))
      if (minRule) bc.minimum_label = minRule.min_basis === 'fixed_amount'
        ? `${((minRule.amount_cents ?? 0) / 100).toFixed(2)}/${minRule.period}`
        : `${minRule.min_orders}×benefit/${minRule.period}`
      billedByCompany.set(deal.companyId, bc)
      for (const p of inv.periods) {
        // day-level view: put each period's billing on its last day
        const bd = billedByDay.get(p.end) ?? { billed: 0, min_topup: 0 }
        bd.billed += p.billed; bd.min_topup += p.min_topup
        billedByDay.set(p.end, bd)
      }
    }
    // Orders without a deal (unmatched) bill at face value.
    for (const r of rows) {
      if (r.agreement_id || r.status === 'cancelled') continue
      const cKey = r.company_id ?? 'none'
      const bc = billedByCompany.get(cKey) ?? { net: 0, billed: 0, min_topup: 0, periods: 0, minimum_label: null }
      bc.net += r.benefit_applied; bc.billed += r.benefit_applied
      billedByCompany.set(cKey, bc)
      if (r.delivery_date) {
        const bd = billedByDay.get(r.delivery_date) ?? { billed: 0, min_topup: 0 }
        bd.billed += r.benefit_applied
        billedByDay.set(r.delivery_date, bd)
      }
    }
    for (const b of billedByCompany.values()) { totals.net_benefit += b.net; totals.billed += b.billed; totals.min_topup += b.min_topup }

    const perCompany = [...byCompany.entries()]
      .map(([key, c]) => {
        const b = billedByCompany.get(key) ?? { net: 0, billed: 0, min_topup: 0, periods: 0, minimum_label: null }
        return {
          company: c.company, orders: c.orders, employees: c.employees.size, gross: c.gross,
          benefit: c.benefit, net_benefit: b.net, topup: c.topup,
          loyalty: c.loyalty, vendor_discount: c.vendor_discount, billed: b.billed, min_topup: b.min_topup,
          billed_periods: b.periods, minimum: b.minimum_label,
        }
      })
      .sort((a, b) => b.gross - a.gross)

    const perEmployee = [...byEmployee.values()]
      .sort((a, b) => (a.company.localeCompare(b.company)) || (b.gross - a.gross))

    const perDay = [...byDay.values()]
      .map((d) => ({ date: d.date, orders: d.orders, employees: d.employees.size, gross: d.gross, benefit: d.benefit, net_benefit: d.net_benefit, topup: d.topup, loyalty: d.loyalty, vendor_discount: d.vendor_discount, billed: billedByDay.get(d.date)?.billed ?? 0, min_topup: billedByDay.get(d.date)?.min_topup ?? 0 }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const orders = rows.slice(0, 500).map((r) => ({
      date: r.delivery_date,
      token: r.order_token,
      voucher: r.voucher_code,
      employee: r.employees?.display_name ?? null,
      company: r.companies?.name ?? null,
      gross: r.subtotal,
      benefit: r.benefit_applied,
      loyalty: r.vendor_loyalty ?? 0,
      vendor_discount: r.vendor_discount ?? 0,
      net_benefit: r.benefit_applied - rowDiscount(r.benefit_applied, r.delivery_date, rulesFor(r.agreement_id)),
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
