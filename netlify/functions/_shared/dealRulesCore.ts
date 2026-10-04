// Deal rules — pure calculation core (no I/O). Everything billing-related reads
// the deal's dated rules (public.deal_rules) through this file, so Reports,
// Reconcile, Invoices and the sync always agree.
//
// What lives where:
//   • VALUES (percentages, amounts, dates, which days count) → database, per deal.
//   • MEANING of each rule kind → here.
//
// Order of operations (agreed with Ioustinos 2026-10-02):
//   per order:   list price → catalogue discount → order discount → company benefit
//                (capped at the day's benefit) → vendor loyalty → employee pays
//   per invoice: Σ benefit − benefit-invoice discount = net
//                billed per period = max(minimum commitment, net)

export type RuleKind =
  | 'catalogue_discount' | 'order_discount' | 'benefit_invoice_discount' | 'minimum_commitment' | 'loyalty'

export type DealRule = {
  id: string
  agreement_id: string
  kind: RuleKind
  valid_from: string            // YYYY-MM-DD
  valid_to: string | null       // inclusive
  percent: number | null
  amount_cents: number | null
  scope_tags: string[]
  min_order_cents: number | null
  amount_unit: 'per_order' | 'per_benefit_day' | null
  period: 'day' | 'week' | 'month' | null
  min_basis: 'fixed_amount' | 'orders_x_benefit' | null
  min_orders: number | null
  counts_on: 'days_with_orders' | 'company_calendar' | 'company_calendar_plus_order_days' | null
  spend_cents: number | null
  earn_cents: number | null
  notes: string | null
}

/** Daily company benefit (cap), from public.benefits + benefit_rules. */
export type BenefitCap = { company_id: string; valid_from: string; valid_to: string | null; cap: number; days: number[] | null }

// ── dates ───────────────────────────────────────────────────────────────────

export function isoDow(date: string): number {
  const d = new Date(date + 'T12:00:00Z').getUTCDay()
  return d === 0 ? 7 : d
}
export function addDays(date: string, n: number): string {
  const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
export function weekStart(date: string): string { return addDays(date, 1 - isoDow(date)) }
export function monthStart(date: string): string { return date.slice(0, 7) + '-01' }
function monthEnd(date: string): string {
  const d = new Date(date.slice(0, 7) + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0)
  return d.toISOString().slice(0, 10)
}
export function periodBounds(date: string, period: 'day' | 'week' | 'month'): { start: string; end: string } {
  if (period === 'day') return { start: date, end: date }
  if (period === 'week') { const s = weekStart(date); return { start: s, end: addDays(s, 6) } }
  return { start: monthStart(date), end: monthEnd(date) }
}
export function activeOn(r: { valid_from: string; valid_to: string | null }, date: string): boolean {
  return date >= r.valid_from && (!r.valid_to || date <= r.valid_to)
}
function eachDay(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

// ── benefit cap ─────────────────────────────────────────────────────────────

export function benefitCapOn(caps: BenefitCap[], companyId: string | null, date: string | null): number | null {
  if (!companyId || !date) return null
  const dow = isoDow(date)
  let best: number | null = null
  for (const c of caps) {
    if (c.company_id !== companyId || !activeOn(c, date)) continue
    if (c.days && !c.days.includes(dow)) continue
    best = best === null ? c.cap : Math.max(best, c.cap)
  }
  return best
}

// ── per-order split ─────────────────────────────────────────────────────────

export type SplitInput = {
  company_id: string | null
  delivery_date: string | null
  subtotal: number          // cents, GO totalNonDiscountedPrice (list price)
  voucher_discount: number  // cents, GO voucherDiscount (combined member-code/voucher discount)
  topup_amount: number      // cents, paid by the employee
}
export type SplitOutput = { benefit_applied: number; vendor_loyalty: number; vendor_discount: number }

/**
 * With an active loyalty rule on the order's date, GO's combined discount is
 * company benefit up to the day's cap (benefit is consumed first) and vendor
 * loyalty above it. Without one, the whole discount is company benefit.
 * vendor_discount = what the vendor took off the price (catalogue/order discounts).
 */
export function splitOrder(o: SplitInput, rules: DealRule[], caps: BenefitCap[]): SplitOutput {
  const voucher = Math.max(0, o.voucher_discount)
  const vendor_discount = Math.max(0, o.subtotal - voucher - o.topup_amount)
  const loyaltyActive = !!o.delivery_date && rules.some((r) => r.kind === 'loyalty' && activeOn(r, o.delivery_date as string))
  if (!loyaltyActive) return { benefit_applied: voucher, vendor_loyalty: 0, vendor_discount }
  const cap = benefitCapOn(caps, o.company_id, o.delivery_date) ?? 0
  const benefit = Math.min(voucher, cap)
  return { benefit_applied: benefit, vendor_loyalty: voucher - benefit, vendor_discount }
}

// ── invoice ─────────────────────────────────────────────────────────────────

export type BillableOrder = {
  delivery_date: string
  benefit_applied: number   // cents (already capped)
  employee_id: string | null
  cancelled?: boolean
}

export type BillingPeriod = {
  kind: 'day' | 'week' | 'month' | 'order_days'   // order_days = no minimum rule; grouped per day
  start: string
  end: string
  orders: number
  benefit: number          // Σ benefit_applied
  discount: number         // benefit-invoice discount
  net: number              // benefit − discount
  minimum: number          // 0 when no minimum applies
  billed: number           // max(minimum, net)
  min_topup: number        // billed − net
}

export type InvoiceResult = {
  orders: number
  benefit: number
  discount: number
  net: number
  minimum_topup: number
  billed: number
  /** effective discount % when a single % rule applied to the whole range, else null */
  discount_pct: number | null
  periods: BillingPeriod[]
}

/**
 * Bill one deal over [from, to] (inclusive dates).
 *   calendar: company workdays (date → is_workday); only used by calendar-based minimums.
 * Rules are dated: each order/day uses the rule active on that date.
 */
export function computeInvoice(args: {
  orders: BillableOrder[]
  rules: DealRule[]
  caps: BenefitCap[]
  companyId: string
  from: string
  to: string
  calendar?: Map<string, boolean>
}): InvoiceResult {
  const { rules, caps, companyId, from, to } = args
  const calendar = args.calendar ?? new Map<string, boolean>()
  const orders = args.orders.filter((o) => !o.cancelled && o.delivery_date >= from && o.delivery_date <= to)

  // 1. Benefit-invoice discount per day (rounded per day+rule, summed).
  const discountRule = (date: string) => rules.find((r) => r.kind === 'benefit_invoice_discount' && activeOn(r, date)) ?? null
  const byDay = new Map<string, { orders: number; benefit: number; empDays: Set<string>; usedOrders: number }>()
  for (const o of orders) {
    const d = byDay.get(o.delivery_date) ?? { orders: 0, benefit: 0, empDays: new Set<string>(), usedOrders: 0 }
    d.orders += 1
    d.benefit += o.benefit_applied
    if (o.benefit_applied > 0) { d.usedOrders += 1; d.empDays.add(o.employee_id ?? `anon-${d.usedOrders}`) }
    byDay.set(o.delivery_date, d)
  }
  const dayDiscount = (date: string, day: { benefit: number; empDays: Set<string>; usedOrders: number }): number => {
    const r = discountRule(date)
    if (!r || day.benefit <= 0) return 0
    if (r.percent != null) return Math.round((day.benefit * Number(r.percent)) / 100)
    const amt = r.amount_cents ?? 0
    const units = r.amount_unit === 'per_benefit_day' ? day.empDays.size : day.usedOrders
    return Math.min(day.benefit, amt * units)
  }

  // 2. Which days count for the minimum, per minimum rule.
  const minRuleOn = (date: string) => rules.find((r) => r.kind === 'minimum_commitment' && activeOn(r, date)) ?? null
  const dayCounts = (date: string, rule: DealRule): boolean => {
    const hasOrders = (byDay.get(date)?.orders ?? 0) > 0
    if (rule.counts_on === 'days_with_orders') return hasOrders
    const workday = calendar.get(date) === true
    if (rule.counts_on === 'company_calendar') return workday
    return workday || hasOrders // company_calendar_plus_order_days
  }

  // 3. Build periods. Every day in range is assigned to exactly one period key.
  type Acc = { kind: BillingPeriod['kind']; start: string; end: string; ownsStart: boolean; orders: number; benefit: number; discount: number; countedDays: string[]; rule: DealRule | null }
  const periods = new Map<string, Acc>()
  for (const date of eachDay(from, to)) {
    const day = byDay.get(date)
    const rule = minRuleOn(date)
    const counted = rule ? dayCounts(date, rule) : false
    if (!day && !counted) continue
    const kind: BillingPeriod['kind'] = rule ? (rule.period as 'day' | 'week' | 'month') : 'order_days'
    const b = rule ? periodBounds(date, rule.period as 'day' | 'week' | 'month') : { start: date, end: date }
    const key = `${kind}:${b.start}`
    const p = periods.get(key) ?? { kind, start: b.start < from ? from : b.start, end: b.end > to ? to : b.end, ownsStart: b.start >= from, orders: 0, benefit: 0, discount: 0, countedDays: [], rule }
    if (day) { p.orders += day.orders; p.benefit += day.benefit; p.discount += dayDiscount(date, day) }
    if (counted) p.countedDays.push(date)
    periods.set(key, p)
  }

  // 4. Minimum per period and billing.
  const out: BillingPeriod[] = []
  for (const p of [...periods.values()].sort((a, b) => a.start.localeCompare(b.start))) {
    const net = p.benefit - p.discount
    let minimum = 0
    // A week/month that started before `from` was already charged its minimum
    // in the range containing its first day — don't charge it twice.
    if (p.rule && p.ownsStart && p.countedDays.length > 0) {
      if (p.rule.min_basis === 'fixed_amount') minimum = p.rule.amount_cents ?? 0
      else {
        // N orders × the daily benefit, on the first counted day of the period.
        const cap = benefitCapOn(caps, companyId, p.countedDays[0]) ?? 0
        minimum = (p.rule.min_orders ?? 0) * cap
      }
    }
    const billed = Math.max(minimum, net)
    out.push({ kind: p.kind, start: p.start, end: p.end, orders: p.orders, benefit: p.benefit, discount: p.discount, net, minimum, billed, min_topup: billed - net })
  }

  const sum = (k: keyof BillingPeriod) => out.reduce((a, p) => a + (p[k] as number), 0)
  const pctRules = rules.filter((r) => r.kind === 'benefit_invoice_discount' && r.valid_from <= to && (!r.valid_to || r.valid_to >= from))
  const discount_pct = pctRules.length === 1 && pctRules[0].percent != null && pctRules[0].valid_from <= from && (!pctRules[0].valid_to || pctRules[0].valid_to >= to)
    ? Number(pctRules[0].percent) : (pctRules.length === 0 ? 0 : null)
  return {
    orders: sum('orders'), benefit: sum('benefit'), discount: sum('discount'), net: sum('net'),
    minimum_topup: sum('min_topup'), billed: sum('billed'), discount_pct, periods: out,
  }
}
