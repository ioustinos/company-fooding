// Per-order split of GO's combined discount, driven by the deal's rules.
// (Math in dealRulesCore.splitOrder; this file only loads what it needs.)

import type { supabaseAdmin } from './supabaseAdmin'
import { splitOrder, type SplitOutput } from './dealRulesCore'
import { loadBenefitCaps, loadRules } from './dealRules'

type Sb = ReturnType<typeof supabaseAdmin>

export type SplitInput = {
  agreement_id: string | null
  company_id: string | null
  delivery_date: string | null
  subtotal: number
  voucher_discount: number
  topup_amount: number
}
export type BillingSplitter = { split: (o: SplitInput) => SplitOutput }

export async function loadBillingSplitter(sb: Sb): Promise<BillingSplitter> {
  const rules = await loadRules(sb)
  // Caps only matter for deals that have a loyalty rule.
  const { data: ags, error } = await sb.from('matchmaking_agreements').select('id, company_id')
  if (error) throw new Error(`billingSplit: agreements: ${error.message}`)
  const loyaltyCompanies = ((ags ?? []) as Array<{ id: string; company_id: string }>)
    .filter((a) => (rules.get(a.id) ?? []).some((r) => r.kind === 'loyalty'))
    .map((a) => a.company_id)
  const caps = await loadBenefitCaps(sb, [...new Set(loyaltyCompanies)])
  return {
    split: (o) => splitOrder(o, o.agreement_id ? rules.get(o.agreement_id) ?? [] : [], caps),
  }
}
