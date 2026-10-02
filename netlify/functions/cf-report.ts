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
// Per-agreement billing rules (matchmaking_agreements.settings.billing, all optional):
//   vendor_discount_applies: false  → net_benefit = benefit (no vendor discount)
//   excess_over_cap: 'vendor_loyalty' → benefit above the day's daily_cap is the
//                       vendor's loyalty credit, reported as `loyalty`, not billed
//   daily_minimum_cents: N  → per (company, delivery day with ≥1 non-cancelled order):
//                       billed = max(N, Σ net_benefit). `billed` / `min_topup` fields.
// Companies without these settings behave exactly as before (billed = net_benefit).
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
  agreement_id: string | null
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
function netBenefit(benefitCents: number, pct: number | string | null | undefined, appliesTo: string | null, vendorDiscountApplies = true): number {
  if (!vendorDiscountApplies) return benefitCents
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
        'external_order_id, order_token, voucher_code, company_id, employee_id, agreement_id, ' +
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

    const billing = await loadBillingContext(sb, rows)

    // ---- aggregate ----
    // CF-97: `benefit` keeps meaning gross (no breaking changes for legacy
    // callers); `net_benefit` is the post-discount amount the company actually
    // owes the vendor. Discount is applied PER ROW using that row's vendor,
    // so per-day totals stay accurate even when companies use multiple vendors.
    const totals = { orders: 0, gross: 0, benefit: 0, net_benefit: 0, topup: 0, loyalty: 0, billed: 0, min_topup: 0 }
    const byCompany = new Map<string, { company: string; orders: number; employees: Set<string>; gross: number; benefit: number; net_benefit: number; topup: number; loyalty: number }>()
    // (company, day) → Σ net benefit of non-cancelled orders, for the daily-minimum floor
    const companyDay = new Map<string, { companyKey: string; date: string; net: number }>()
    const byEmployee = new Map<string, { company: string; name: string; voucher: string; orders: number; gross: number; benefit: number; net_benefit: number; topup: number }>()
    const byDay = new Map<string, { date: string; orders: number; employees: Set<string>; gross: number; benefit: number; net_benefit: number; topup: number }>()

    for (const r of rows) {
      const rule = billing.ruleFor(r.agreement_id)
      const { benefit: rowBenefit, loyalty: rowLoyalty } = billing.split(r, rule)
      const rowNet = netBenefit(rowBenefit, r.vendors?.discount_percentage ?? null, r.vendors?.discount_applies_to ?? null, rule.vendorDiscountApplies)

      totals.loyalty += rowLoyalty
      if (r.status !== 'cancelled' && r.delivery_date) {
        const cdKey = `${r.company_id ?? 'none'}::${r.delivery_date}`
        const cd = companyDay.get(cdKey) ?? { companyKey: r.company_id ?? 'none', date: r.delivery_date, net: 0 }
        cd.net += rowNet
        companyDay.set(cdKey, cd)
      }

      totals.orders += 1
      totals.gross += r.subtotal
      totals.benefit += rowBenefit
      totals.net_benefit += rowNet
      totals.topup += r.topup_amount

      const companyName = r.companies?.name ?? '— unknown —'
      const empName = r.employees?.display_name ?? (r.voucher_code ?? '— unmatched —')
      const voucher = r.voucher_code ?? '—'

      const cKey = r.company_id ?? 'none'
      const c = byCompany.get(cKey) ?? { company: companyName, orders: 0, employees: new Set<string>(), gross: 0, benefit: 0, net_benefit: 0, topup: 0, loyalty: 0 }
      c.orders += 1; c.gross += r.subtotal; c.benefit += rowBenefit; c.net_benefit += rowNet; c.topup += r.topup_amount; c.loyalty += rowLoyalty
      if (r.employee_id) c.employees.add(r.employee_id)
      byCompany.set(cKey, c)

      const eKey = `${cKey}::${(voucher).toLowerCase()}`
      const e = byEmployee.get(eKey) ?? { company: companyName, name: empName, voucher, orders: 0, gross: 0, benefit: 0, net_benefit: 0, topup: 0 }
      e.orders += 1; e.gross += r.subtotal; e.benefit += rowBenefit; e.net_benefit += rowNet; e.topup += r.topup_amount
      byEmployee.set(eKey, e)

      if (r.delivery_date) {
        const d = byDay.get(r.delivery_date) ?? { date: r.delivery_date, orders: 0, employees: new Set<string>(), gross: 0, benefit: 0, net_benefit: 0, topup: 0 }
        d.orders += 1; d.gross += r.subtotal; d.benefit += rowBenefit; d.net_benefit += rowNet; d.topup += r.topup_amount
        if (r.employee_id) d.employees.add(r.employee_id)
        byDay.set(r.delivery_date, d)
      }
    }

    // Billed = Σ over (company, day) of max(daily_minimum, Σ net). Without a minimum, billed = net.
    const billedByCompany = new Map<string, { billed: number; min_topup: number; days: number }>()
    const billedByDay = new Map<string, { billed: number; min_topup: number }>()
    for (const cd of companyDay.values()) {
      const min = billing.minimumFor(cd.companyKey)
      const billed = Math.max(min, cd.net)
      const top = billed - cd.net
      const bc = billedByCompany.get(cd.companyKey) ?? { billed: 0, min_topup: 0, days: 0 }
      bc.billed += billed; bc.min_topup += top; bc.days += 1
      billedByCompany.set(cd.companyKey, bc)
      const bd = billedByDay.get(cd.date) ?? { billed: 0, min_topup: 0 }
      bd.billed += billed; bd.min_topup += top
      billedByDay.set(cd.date, bd)
      totals.billed += billed; totals.min_topup += top
    }

    const perCompany = [...byCompany.entries()]
      .map(([key, c]) => {
        const b = billedByCompany.get(key) ?? { billed: 0, min_topup: 0, days: 0 }
        return {
          company: c.company, orders: c.orders, employees: c.employees.size, gross: c.gross,
          benefit: c.benefit, net_benefit: c.net_benefit, topup: c.topup,
          loyalty: c.loyalty, billed: b.billed, min_topup: b.min_topup, billed_days: b.days,
          daily_minimum: billing.minimumFor(key) || null,
        }
      })
      .sort((a, b) => b.gross - a.gross)

    const perEmployee = [...byEmployee.values()]
      .sort((a, b) => (a.company.localeCompare(b.company)) || (b.gross - a.gross))

    const perDay = [...byDay.values()]
      .map((d) => ({ date: d.date, orders: d.orders, employees: d.employees.size, gross: d.gross, benefit: d.benefit, net_benefit: d.net_benefit, topup: d.topup, billed: billedByDay.get(d.date)?.billed ?? 0, min_topup: billedByDay.get(d.date)?.min_topup ?? 0 }))
      .sort((a, b) => a.date.localeCompare(b.date))

    const orders = rows.slice(0, 500).map((r) => {
      const rule = billing.ruleFor(r.agreement_id)
      const { benefit, loyalty } = billing.split(r, rule)
      return {
        date: r.delivery_date,
        token: r.order_token,
        voucher: r.voucher_code,
        employee: r.employees?.display_name ?? null,
        company: r.companies?.name ?? null,
        gross: r.subtotal,
        benefit,
        loyalty,
        net_benefit: netBenefit(benefit, r.vendors?.discount_percentage ?? null, r.vendors?.discount_applies_to ?? null, rule.vendorDiscountApplies),
        topup: r.topup_amount,
        status: r.status,
      }
    })

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

// ── per-agreement billing rules ─────────────────────────────────────────────

type BillingRule = {
  vendorDiscountApplies: boolean
  excessIsVendorLoyalty: boolean
  dailyMinimumCents: number
}
const DEFAULT_RULE: BillingRule = { vendorDiscountApplies: true, excessIsVendorLoyalty: false, dailyMinimumCents: 0 }

type CapRow = { company_id: string; valid_from: string; valid_to: string | null; cap: number }

async function loadBillingContext(sb: ReturnType<typeof supabaseAdmin>, rows: OrderRow[]) {
  const agreementIds = [...new Set(rows.map((r) => r.agreement_id).filter((x): x is string => !!x))]
  const rules = new Map<string, BillingRule>()
  const minByCompany = new Map<string, number>()
  const loyaltyCompanies = new Set<string>()

  if (agreementIds.length) {
    const { data, error } = await sb.from('matchmaking_agreements')
      .select('id, company_id, settings').in('id', agreementIds)
    if (error) throw new Error(`Failed to load agreements: ${error.message}`)
    for (const a of (data ?? []) as Array<{ id: string; company_id: string; settings: Record<string, unknown> | null }>) {
      const b = (a.settings?.billing ?? {}) as Record<string, unknown>
      const rule: BillingRule = {
        vendorDiscountApplies: b.vendor_discount_applies !== false,
        excessIsVendorLoyalty: b.excess_over_cap === 'vendor_loyalty',
        dailyMinimumCents: Number.isFinite(Number(b.daily_minimum_cents)) ? Math.max(0, Number(b.daily_minimum_cents)) : 0,
      }
      rules.set(a.id, rule)
      if (rule.dailyMinimumCents > 0) minByCompany.set(a.company_id, Math.max(minByCompany.get(a.company_id) ?? 0, rule.dailyMinimumCents))
      if (rule.excessIsVendorLoyalty) loyaltyCompanies.add(a.company_id)
    }
  }

  // Daily caps only needed for companies whose excess counts as vendor loyalty.
  const caps: CapRow[] = []
  if (loyaltyCompanies.size) {
    const { data, error } = await sb.from('benefits')
      .select('company_id, valid_from, valid_to, credit_amount, benefit_rules(daily_cap, topup_amount, topup_cadence)')
      .in('company_id', [...loyaltyCompanies])
    if (error) throw new Error(`Failed to load benefit caps: ${error.message}`)
    type BRow = { company_id: string; valid_from: string; valid_to: string | null; credit_amount: number
      benefit_rules: { daily_cap: number | null; topup_amount: number; topup_cadence: string }[] | { daily_cap: number | null; topup_amount: number; topup_cadence: string } | null }
    for (const b of (data ?? []) as unknown as BRow[]) {
      const rule = Array.isArray(b.benefit_rules) ? b.benefit_rules[0] : b.benefit_rules
      if (!rule || rule.topup_cadence !== 'daily') continue
      caps.push({ company_id: b.company_id, valid_from: b.valid_from, valid_to: b.valid_to, cap: rule.daily_cap ?? rule.topup_amount ?? b.credit_amount })
    }
  }

  const capFor = (companyId: string | null, date: string | null): number | null => {
    if (!companyId || !date) return null
    let best: number | null = null
    for (const c of caps) {
      if (c.company_id !== companyId) continue
      if (date < c.valid_from || (c.valid_to && date > c.valid_to)) continue
      best = best === null ? c.cap : Math.max(best, c.cap)
    }
    return best
  }

  return {
    ruleFor: (agreementId: string | null): BillingRule => (agreementId && rules.get(agreementId)) || DEFAULT_RULE,
    minimumFor: (companyKey: string): number => minByCompany.get(companyKey) ?? 0,
    // Split the GO voucher discount into company benefit vs vendor loyalty.
    split: (r: OrderRow, rule: BillingRule): { benefit: number; loyalty: number } => {
      if (!rule.excessIsVendorLoyalty) return { benefit: r.benefit_applied, loyalty: 0 }
      const cap = capFor(r.company_id, r.delivery_date)
      if (cap === null) return { benefit: r.benefit_applied, loyalty: 0 }
      const benefit = Math.min(r.benefit_applied, cap)
      return { benefit, loyalty: r.benefit_applied - benefit }
    },
  }
}
