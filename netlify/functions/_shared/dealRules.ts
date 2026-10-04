// Deal rules — database loader around dealRulesCore.ts (the pure math).

import type { supabaseAdmin } from './supabaseAdmin'
import type { BenefitCap, DealRule } from './dealRulesCore'

type Sb = ReturnType<typeof supabaseAdmin>

export const DEAL_RULE_COLUMNS =
  'id, agreement_id, kind, valid_from, valid_to, percent, amount_cents, scope_tags, min_order_cents, ' +
  'amount_unit, period, min_basis, min_orders, counts_on, spend_cents, earn_cents, notes'

export function normalizeRule(r: Record<string, unknown>): DealRule {
  return {
    ...(r as unknown as DealRule),
    percent: r.percent == null ? null : Number(r.percent),
    scope_tags: (r.scope_tags as string[] | null) ?? [],
  }
}

export async function loadRules(sb: Sb, agreementIds?: string[]): Promise<Map<string, DealRule[]>> {
  let q = sb.from('deal_rules').select(DEAL_RULE_COLUMNS).order('valid_from')
  if (agreementIds) {
    if (agreementIds.length === 0) return new Map()
    q = q.in('agreement_id', agreementIds)
  }
  const { data, error } = await q
  if (error) throw new Error(`deal_rules: ${error.message}`)
  const out = new Map<string, DealRule[]>()
  for (const raw of (data ?? []) as unknown as Record<string, unknown>[]) {
    const r = normalizeRule(raw)
    const list = out.get(r.agreement_id) ?? []
    list.push(r)
    out.set(r.agreement_id, list)
  }
  return out
}

/** Daily benefit caps (daily-cadence benefits) for the given companies. */
export async function loadBenefitCaps(sb: Sb, companyIds?: string[]): Promise<BenefitCap[]> {
  let q = sb.from('benefits')
    .select('company_id, valid_from, valid_to, credit_amount, benefit_rules(daily_cap, topup_amount, topup_cadence, days_of_week)')
  if (companyIds) {
    if (companyIds.length === 0) return []
    q = q.in('company_id', companyIds)
  }
  const { data, error } = await q
  if (error) throw new Error(`benefit caps: ${error.message}`)
  type Rule = { daily_cap: number | null; topup_amount: number; topup_cadence: string; days_of_week: number[] | null }
  type BRow = { company_id: string; valid_from: string; valid_to: string | null; credit_amount: number; benefit_rules: Rule[] | Rule | null }
  const caps: BenefitCap[] = []
  for (const b of (data ?? []) as unknown as BRow[]) {
    const rule = Array.isArray(b.benefit_rules) ? b.benefit_rules[0] : b.benefit_rules
    if (!rule || rule.topup_cadence !== 'daily') continue
    caps.push({
      company_id: b.company_id, valid_from: b.valid_from, valid_to: b.valid_to,
      cap: rule.daily_cap ?? rule.topup_amount ?? b.credit_amount,
      days: rule.days_of_week?.length ? rule.days_of_week : null,
    })
  }
  return caps
}

/** company_calendar for one company over [from, to] → date → is_workday. */
export async function loadCalendar(sb: Sb, companyId: string, from: string, to: string): Promise<Map<string, boolean>> {
  const { data, error } = await sb.from('company_calendar')
    .select('date, is_workday').eq('company_id', companyId).gte('date', from).lte('date', to)
  if (error) throw new Error(`company_calendar: ${error.message}`)
  return new Map(((data ?? []) as Array<{ date: string; is_workday: boolean }>).map((r) => [r.date, r.is_workday]))
}
