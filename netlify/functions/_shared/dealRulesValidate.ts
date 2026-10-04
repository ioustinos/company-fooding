// Deal rules — input validation + overlap checks (pure; used by cf-deal-rules).
// The database CHECK constraints (migration 22) are the second safety net.

import type { DealRule, RuleKind } from './dealRulesCore'

export const RULE_KINDS: RuleKind[] = ['catalogue_discount', 'order_discount', 'benefit_invoice_discount', 'minimum_commitment', 'loyalty']

/** Editable fields of a rule (no id / agreement / audit columns). */
export type RuleInput = Omit<DealRule, 'id' | 'agreement_id'>

const DATE = /^\d{4}-\d{2}-\d{2}$/
const isDate = (v: unknown): v is string => typeof v === 'string' && DATE.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'))
const int = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isInteger(Number(v)) ? Number(v) : NaN)
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v))

export function normalizeRuleInput(raw: Record<string, unknown>): { rule: RuleInput | null; errors: Record<string, string[]> } {
  const errors: Record<string, string[]> = {}
  const err = (f: string, m: string) => { (errors[f] ??= []).push(m) }

  const kind = raw.kind as RuleKind
  if (!RULE_KINDS.includes(kind)) { err('kind', 'Unknown rule type'); return { rule: null, errors } }
  if (!isDate(raw.valid_from)) err('valid_from', 'Start date is required (YYYY-MM-DD)')
  const valid_to = raw.valid_to == null || raw.valid_to === '' ? null : raw.valid_to
  if (valid_to !== null && !isDate(valid_to)) err('valid_to', 'End date must be YYYY-MM-DD')
  if (isDate(raw.valid_from) && isDate(valid_to) && valid_to < raw.valid_from) err('valid_to', 'End date is before start date')

  const r: RuleInput = {
    kind,
    valid_from: raw.valid_from as string,
    valid_to: valid_to as string | null,
    percent: null, amount_cents: null, scope_tags: [], min_order_cents: null, amount_unit: null,
    period: null, min_basis: null, min_orders: null, counts_on: null, spend_cents: null, earn_cents: null,
    notes: typeof raw.notes === 'string' && raw.notes.trim() ? raw.notes.trim() : null,
  }

  const discountValue = () => {
    const pct = num(raw.percent), amt = int(raw.amount_cents)
    if ((pct === null) === (amt === null)) { err('value', 'Enter either a percentage or an amount'); return }
    if (pct !== null) { if (!(pct > 0 && pct <= 100)) err('percent', 'Percentage must be between 0 and 100'); else r.percent = Math.round(pct * 100) / 100 }
    if (amt !== null) { if (!(Number.isInteger(amt) && amt > 0)) err('amount_cents', 'Amount must be greater than 0'); else r.amount_cents = amt }
  }

  switch (kind) {
    case 'catalogue_discount': {
      discountValue()
      const tags = Array.isArray(raw.scope_tags) ? raw.scope_tags : []
      r.scope_tags = [...new Set(tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))]
      break
    }
    case 'order_discount': {
      discountValue()
      const mo = int(raw.min_order_cents)
      if (mo !== null) { if (!(Number.isInteger(mo) && mo >= 0)) err('min_order_cents', 'Minimum order must be 0 or more'); else r.min_order_cents = mo }
      break
    }
    case 'benefit_invoice_discount': {
      discountValue()
      if (r.amount_cents !== null) {
        if (raw.amount_unit !== 'per_order' && raw.amount_unit !== 'per_benefit_day') err('amount_unit', 'Choose per order or per benefit day')
        else r.amount_unit = raw.amount_unit
      }
      break
    }
    case 'minimum_commitment': {
      if (!['day', 'week', 'month'].includes(String(raw.period))) err('period', 'Choose day, week or month'); else r.period = raw.period as RuleInput['period']
      if (!['days_with_orders', 'company_calendar', 'company_calendar_plus_order_days'].includes(String(raw.counts_on))) err('counts_on', 'Choose which days count')
      else r.counts_on = raw.counts_on as RuleInput['counts_on']
      if (raw.min_basis === 'fixed_amount') {
        r.min_basis = 'fixed_amount'
        const amt = int(raw.amount_cents)
        if (amt === null || !(Number.isInteger(amt) && amt > 0)) err('amount_cents', 'Minimum amount must be greater than 0'); else r.amount_cents = amt
      } else if (raw.min_basis === 'orders_x_benefit') {
        r.min_basis = 'orders_x_benefit'
        const n = int(raw.min_orders)
        if (n === null || !(Number.isInteger(n) && n > 0)) err('min_orders', 'Number of orders must be greater than 0'); else r.min_orders = n
      } else err('min_basis', 'Choose a fixed amount or a number of orders × benefit')
      break
    }
    case 'loyalty': {
      const s = int(raw.spend_cents), e = int(raw.earn_cents)
      if (s === null || !(Number.isInteger(s) && s > 0)) err('spend_cents', 'Spend amount must be greater than 0'); else r.spend_cents = s
      if (e === null || !(Number.isInteger(e) && e > 0)) err('earn_cents', 'Earned amount must be greater than 0'); else r.earn_cents = e
      break
    }
  }
  return Object.keys(errors).length ? { rule: null, errors } : { rule: r, errors }
}

const rangesOverlap = (a: { valid_from: string; valid_to: string | null }, b: { valid_from: string; valid_to: string | null }) =>
  a.valid_from <= (b.valid_to ?? '9999-12-31') && b.valid_from <= (a.valid_to ?? '9999-12-31')

/**
 * Same kind + overlapping dates on the same deal = conflict. Catalogue
 * discounts may overlap when they cover different tags (empty = whole catalogue,
 * which overlaps everything).
 */
export function findOverlap(rule: Pick<DealRule, 'kind' | 'valid_from' | 'valid_to' | 'scope_tags'>, existing: DealRule[], ignoreId?: string): DealRule | null {
  for (const x of existing) {
    if (x.id === ignoreId || x.kind !== rule.kind || !rangesOverlap(rule, x)) continue
    if (rule.kind === 'catalogue_discount') {
      const a = rule.scope_tags ?? [], b = x.scope_tags ?? []
      if (a.length && b.length && !a.some((t) => b.includes(t))) continue
    }
    return x
  }
  return null
}

export function athensToday(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Athens' }).format(now)
}
