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
// CF-97 (2026-06-01): now applies the vendor's discount_percentage when
// `discount_applies_to = 'benefit_price'`. Returns benefit_gross,
// discount_cents, benefit_net per row + totals so the UI / PDF can render the
// breakdown.
//
// super_admin → any company; company_admin → own (companyId param ignored).

import type { Context } from '@netlify/functions'
import { ok, badRequest, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'

type Row = {
  company_id: string | null
  vendor_id: string | null
  subtotal: number
  benefit_applied: number
  topup_amount: number
  delivery_date: string | null
  status: string
  vendors: { name: string | null; discount_percentage: number | string | null; discount_applies_to: string | null } | null
}

// Round half-away-from-zero in cents so €0.005 → €0.01 (matches what most
// accounting software expects for VAT-style discount math).
function applyDiscount(benefitCents: number, pct: number, appliesTo: string | null) {
  if (!pct || pct <= 0) return { discount_cents: 0, net_cents: benefitCents }
  // Today we only know how to apply to benefit_price. Future: handle
  // 'subtotal', 'total' etc. when product asks for them.
  if (appliesTo !== 'benefit_price') return { discount_cents: 0, net_cents: benefitCents }
  // benefitCents is integer cents, pct is 0..100. Multiply, divide by 100,
  // round to nearest integer cent.
  const discount_cents = Math.round((benefitCents * pct) / 100)
  return { discount_cents, net_cents: benefitCents - discount_cents }
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
      .select('company_id, vendor_id, subtotal, benefit_applied, topup_amount, delivery_date, status, vendors(name, discount_percentage, discount_applies_to)')
      .eq('company_id', companyId)
      .neq('status', 'cancelled')
      .gte('delivery_date', from)
      .lte('delivery_date', to)
      .limit(20000)
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as unknown as Row[]

    const currentMonth = new Date().toISOString().slice(0, 7) // YYYY-MM
    type Bucket = {
      vendor_id: string | null
      vendor_name: string
      month: string
      orders: number
      gross: number              // sum of subtotal (cents)
      benefit_gross: number      // sum of benefit_applied (cents) — before discount
      extra: number              // sum of topup_amount (cents)
      discount_pct: number       // 0..100 from vendor row
      discount_applies_to: string | null
    }
    const map = new Map<string, Bucket>()
    for (const r of rows) {
      if (!r.delivery_date) continue
      const month = r.delivery_date.slice(0, 7)
      const key = `${r.vendor_id ?? 'none'}::${month}`
      const v = r.vendors
      const pct = v && v.discount_percentage != null ? Number(v.discount_percentage) : 0
      const bucket = map.get(key) ?? {
        vendor_id: r.vendor_id,
        vendor_name: v?.name ?? '—',
        month,
        orders: 0, gross: 0, benefit_gross: 0, extra: 0,
        discount_pct: Number.isFinite(pct) ? pct : 0,
        discount_applies_to: v?.discount_applies_to ?? null,
      }
      bucket.orders += 1
      bucket.gross += r.subtotal
      bucket.benefit_gross += r.benefit_applied
      bucket.extra += r.topup_amount
      map.set(key, bucket)
    }

    // Apply discount at the bucket-aggregate level. (Per-row × N would also
    // work and would differ from aggregate by <€0.01 due to rounding; the
    // bucket-level math is what the company actually sees on the invoice.)
    const invoices = [...map.values()].map((b) => {
      const { discount_cents, net_cents } = applyDiscount(b.benefit_gross, b.discount_pct, b.discount_applies_to)
      return {
        ...b,
        // Legacy alias so existing callers don't break: `benefit` === gross.
        benefit: b.benefit_gross,
        benefit_gross: b.benefit_gross,
        discount_cents,
        benefit_net: net_cents,
        status: b.month === currentMonth ? 'current' : 'open',
      }
    }).sort((a, b) => b.month.localeCompare(a.month) || a.vendor_name.localeCompare(b.vendor_name))

    // Totals on the visible window
    const totals = invoices.reduce(
      (acc, b) => ({
        orders: acc.orders + b.orders,
        gross: acc.gross + b.gross,
        benefit: acc.benefit + b.benefit_gross,         // legacy alias
        benefit_gross: acc.benefit_gross + b.benefit_gross,
        discount_cents: acc.discount_cents + b.discount_cents,
        benefit_net: acc.benefit_net + b.benefit_net,
        extra: acc.extra + b.extra,
      }),
      { orders: 0, gross: 0, benefit: 0, benefit_gross: 0, discount_cents: 0, benefit_net: 0, extra: 0 },
    )

    return ok({ period: { from, to }, totals, invoices })
  } catch (e) {
    return errorResponse(e)
  }
}
