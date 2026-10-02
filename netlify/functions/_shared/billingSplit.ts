// Who funds each part of a GO order's discount.
//
// GO gives one combined voucher/member-code discount per order. CF splits it:
//   benefit_applied  — company benefit, billed to the company (capped at the
//                      day's daily benefit when the agreement says the excess
//                      is vendor loyalty)
//   vendor_loyalty   — vendor-funded part above that cap (benefit is consumed
//                      first; loyalty only covers what is above it)
//   vendor_discount  — vendor item discount already baked into GO's price
//                      (subtotal − voucher discount − amount paid, ≥ 0)
//
// Agreement rule source: matchmaking_agreements.settings.billing.excess_over_cap
// = 'vendor_loyalty'. Agreements without it keep benefit_applied = GO's discount.

import type { supabaseAdmin } from './supabaseAdmin'

type Sb = ReturnType<typeof supabaseAdmin>

type CapRow = { company_id: string; valid_from: string; valid_to: string | null; cap: number; days: number[] | null }

export type SplitInput = {
  agreement_id: string | null
  company_id: string | null
  delivery_date: string | null
  subtotal: number          // cents, GO totalNonDiscountedPrice
  voucher_discount: number  // cents, GO voucherDiscount (raw, combined)
  topup_amount: number      // cents, GO totalDiscountedPrice (paid by employee)
}
export type SplitOutput = { benefit_applied: number; vendor_loyalty: number; vendor_discount: number }

export type BillingSplitter = { split: (o: SplitInput) => SplitOutput }

export async function loadBillingSplitter(sb: Sb): Promise<BillingSplitter> {
  const { data: ags, error: agErr } = await sb.from('matchmaking_agreements')
    .select('id, company_id, settings')
  if (agErr) throw new Error(`billingSplit: agreements: ${agErr.message}`)

  const loyaltyAgreements = new Set<string>()
  const loyaltyCompanies = new Set<string>()
  for (const a of (ags ?? []) as Array<{ id: string; company_id: string; settings: Record<string, unknown> | null }>) {
    const billing = (a.settings?.billing ?? {}) as Record<string, unknown>
    if (billing.excess_over_cap === 'vendor_loyalty') {
      loyaltyAgreements.add(a.id)
      loyaltyCompanies.add(a.company_id)
    }
  }

  const caps: CapRow[] = []
  if (loyaltyCompanies.size) {
    const { data, error } = await sb.from('benefits')
      .select('company_id, valid_from, valid_to, credit_amount, benefit_rules(daily_cap, topup_amount, topup_cadence, days_of_week)')
      .in('company_id', [...loyaltyCompanies])
    if (error) throw new Error(`billingSplit: benefits: ${error.message}`)
    type Rule = { daily_cap: number | null; topup_amount: number; topup_cadence: string; days_of_week: number[] | null }
    type BRow = { company_id: string; valid_from: string; valid_to: string | null; credit_amount: number; benefit_rules: Rule[] | Rule | null }
    for (const b of (data ?? []) as unknown as BRow[]) {
      const rule = Array.isArray(b.benefit_rules) ? b.benefit_rules[0] : b.benefit_rules
      if (!rule || rule.topup_cadence !== 'daily') continue
      caps.push({ company_id: b.company_id, valid_from: b.valid_from, valid_to: b.valid_to, cap: rule.daily_cap ?? rule.topup_amount ?? b.credit_amount, days: rule.days_of_week?.length ? rule.days_of_week : null })
    }
  }

  return { split: (o) => splitOrder(o, loyaltyAgreements, caps) }
}

// 1 = Monday … 7 = Sunday, for a YYYY-MM-DD calendar date.
function isoDow(date: string): number {
  const d = new Date(date + 'T12:00:00Z').getUTCDay()
  return d === 0 ? 7 : d
}

export function splitOrder(o: SplitInput, loyaltyAgreements: Set<string>, caps: CapRow[]): SplitOutput {
  const voucher = Math.max(0, o.voucher_discount)
  const vendor_discount = Math.max(0, o.subtotal - voucher - o.topup_amount)

  let benefit = voucher
  if (o.agreement_id && loyaltyAgreements.has(o.agreement_id) && o.company_id && o.delivery_date) {
    let cap: number | null = null
    const dow = isoDow(o.delivery_date)
    for (const c of caps) {
      if (c.days && !c.days.includes(dow)) continue
      if (c.company_id !== o.company_id) continue
      if (o.delivery_date < c.valid_from || (c.valid_to && o.delivery_date > c.valid_to)) continue
      cap = cap === null ? c.cap : Math.max(cap, c.cap)
    }
    // No benefit active that day → the whole discount is the vendor's loyalty.
    benefit = Math.min(voucher, cap ?? 0)
  }
  return { benefit_applied: benefit, vendor_loyalty: voucher - benefit, vendor_discount }
}
