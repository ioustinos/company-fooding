// cf-invoices — derived monthly invoice view per (company × vendor).
//
// GET /api/cf-invoices?companyId=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD
//
// Computed live from orders (no invoices table yet). One row per (vendor × YYYY-MM),
// excluding cancelled orders. Status "current" for the in-progress month, else "open".
//
// Money follows the deal's dated rules (public.deal_rules) via computeInvoice:
//   benefit_gross   Σ company benefit (vendor loyalty already excluded at sync)
//   discount_cents  benefit-invoice discount
//   benefit_net     benefit_gross − discount_cents
//   minimum_topup   extra owed to reach the minimum commitment
//   billed          what to invoice = Σ per period max(minimum, net)
// A weekly/monthly minimum period is billed in the month its first day falls in.
//
// super_admin → any company; company_admin → own (companyId param ignored).

import type { Context } from '@netlify/functions'
import { ok, badRequest, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'
import { computeInvoice } from './_shared/dealRulesCore'
import { loadBenefitCaps, loadCalendar, loadRules } from './_shared/dealRules'

type Row = {
  vendor_id: string | null
  agreement_id: string | null
  employee_id: string | null
  subtotal: number
  benefit_applied: number
  topup_amount: number
  delivery_date: string | null
  vendors: { name: string | null } | null
}

function monthEnd(month: string): string {
  const d = new Date(month + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0)
  return d.toISOString().slice(0, 10)
}

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
      .select('vendor_id, agreement_id, employee_id, subtotal, benefit_applied, topup_amount, delivery_date, vendors(name)')
      .eq('company_id', companyId)
      .neq('status', 'cancelled')
      .gte('delivery_date', from)
      .lte('delivery_date', to)
      .limit(20000)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as Row[]

    // Deal per vendor for this company (orders without agreement_id fall back to it).
    const { data: ags } = await sb.from('matchmaking_agreements')
      .select('id, vendor_id').eq('company_id', companyId)
    const dealByVendor = new Map(((ags ?? []) as Array<{ id: string; vendor_id: string }>).map((a) => [a.vendor_id, a.id]))
    const agreementIds = [...new Set([...dealByVendor.values()])]
    const [rulesByAgreement, caps] = await Promise.all([loadRules(sb, agreementIds), loadBenefitCaps(sb, [companyId])])
    const needsCalendar = [...rulesByAgreement.values()].flat()
      .some((r) => r.kind === 'minimum_commitment' && r.counts_on !== 'days_with_orders')
    const calendar = needsCalendar ? await loadCalendar(sb, companyId, from, to) : undefined

    const currentMonth = new Date().toISOString().slice(0, 7)
    type Bucket = { vendor_id: string | null; vendor_name: string; month: string; agreement_id: string | null
      orders: Row[]; gross: number; extra: number }
    const map = new Map<string, Bucket>()
    for (const r of rows) {
      if (!r.delivery_date) continue
      const month = r.delivery_date.slice(0, 7)
      const key = `${r.vendor_id ?? 'none'}::${month}`
      const b = map.get(key) ?? {
        vendor_id: r.vendor_id, vendor_name: r.vendors?.name ?? '—', month,
        agreement_id: r.agreement_id ?? (r.vendor_id ? dealByVendor.get(r.vendor_id) ?? null : null),
        orders: [], gross: 0, extra: 0,
      }
      b.orders.push(r); b.gross += r.subtotal; b.extra += r.topup_amount
      map.set(key, b)
    }

    const invoices = [...map.values()].map((b) => {
      const mFrom = b.month + '-01' < from ? from : b.month + '-01'
      const mTo = monthEnd(b.month) > to ? to : monthEnd(b.month)
      const inv = computeInvoice({
        orders: b.orders.map((o) => ({ delivery_date: o.delivery_date as string, benefit_applied: o.benefit_applied, employee_id: o.employee_id })),
        rules: b.agreement_id ? rulesByAgreement.get(b.agreement_id) ?? [] : [],
        caps, companyId, from: mFrom, to: mTo, calendar,
      })
      return {
        vendor_id: b.vendor_id,
        vendor_name: b.vendor_name,
        month: b.month,
        orders: b.orders.length,
        gross: b.gross,
        extra: b.extra,
        benefit: inv.benefit,              // legacy alias (= gross benefit)
        benefit_gross: inv.benefit,
        discount_cents: inv.discount,
        discount_pct: inv.discount_pct ?? 0,
        discount_mixed: inv.discount_pct === null,
        benefit_net: inv.net,
        minimum_topup: inv.minimum_topup,
        billed: inv.billed,
        status: b.month === currentMonth ? 'current' : 'open',
      }
    }).sort((a, b) => b.month.localeCompare(a.month) || a.vendor_name.localeCompare(b.vendor_name))

    const totals = invoices.reduce(
      (acc, b) => ({
        orders: acc.orders + b.orders,
        gross: acc.gross + b.gross,
        benefit: acc.benefit + b.benefit_gross,
        benefit_gross: acc.benefit_gross + b.benefit_gross,
        discount_cents: acc.discount_cents + b.discount_cents,
        benefit_net: acc.benefit_net + b.benefit_net,
        minimum_topup: acc.minimum_topup + b.minimum_topup,
        billed: acc.billed + b.billed,
        extra: acc.extra + b.extra,
      }),
      { orders: 0, gross: 0, benefit: 0, benefit_gross: 0, discount_cents: 0, benefit_net: 0, minimum_topup: 0, billed: 0, extra: 0 },
    )

    return ok({ period: { from, to }, totals, invoices })
  } catch (e) {
    return errorResponse(e)
  }
}
