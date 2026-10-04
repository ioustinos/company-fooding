// Plain-language sentences for deal rules (el/en). Used by the Deal terms
// section for both the list and the live preview while editing.

import { moneyFull } from './specui'

export type RuleKind = 'catalogue_discount' | 'order_discount' | 'benefit_invoice_discount' | 'minimum_commitment' | 'loyalty'
export type DealRuleView = {
  id?: string
  kind: RuleKind
  valid_from: string
  valid_to: string | null
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
type Lang = 'el' | 'en'

export const KIND_LABEL: Record<RuleKind, { el: string; en: string; hintEl: string; hintEn: string }> = {
  catalogue_discount: { el: 'Έκπτωση στις τιμές καταλόγου', en: 'Catalogue price discount',
    hintEl: 'Ο προμηθευτής μειώνει τις τιμές του καταλόγου για τους υπαλλήλους.', hintEn: 'The vendor lowers listing prices for the employees.' },
  order_discount: { el: 'Έκπτωση στην παραγγελία', en: 'Order discount to employees',
    hintEl: 'Έκπτωση του προμηθευτή σε κάθε παραγγελία υπαλλήλου.', hintEn: 'Vendor discount on each employee order.' },
  benefit_invoice_discount: { el: 'Έκπτωση στο τιμολόγιο παροχής', en: 'Benefit-invoice discount',
    hintEl: 'Έκπτωση του προμηθευτή στην παροχή που τιμολογείται στην εταιρεία.', hintEn: 'Vendor discount on the benefit invoiced to the company.' },
  minimum_commitment: { el: 'Ελάχιστη χρέωση', en: 'Minimum commitment',
    hintEl: 'Η εταιρεία πληρώνει τουλάχιστον ένα ποσό ανά περίοδο.', hintEn: 'The company pays at least an amount per period.' },
  loyalty: { el: 'Πρόγραμμα επιβράβευσης', en: 'Loyalty',
    hintEl: 'Πίστωση από τον προμηθευτή ανάλογα με τη δαπάνη· χρησιμοποιείται μετά την παροχή.', hintEn: 'Vendor credit earned on spend; used after the benefit.' },
}

const PERIOD = { day: { el: 'ημέρα', en: 'day' }, week: { el: 'εβδομάδα', en: 'week' }, month: { el: 'μήνα', en: 'month' } }

function fmtDate(d: string, lang: Lang): string {
  return new Intl.DateTimeFormat(lang === 'el' ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(d + 'T12:00:00Z'))
}

export function ruleSentence(r: DealRuleView, lang: Lang): string {
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const m = (c: number | null) => moneyFull(c ?? 0, lang)
  const value = r.percent != null ? `${r.percent}%` : m(r.amount_cents)
  switch (r.kind) {
    case 'catalogue_discount': {
      const scope = r.scope_tags.length ? L(`για ετικέτες: ${r.scope_tags.join(', ')}`, `on tags: ${r.scope_tags.join(', ')}`) : L('σε όλο τον κατάλογο', 'on the whole catalogue')
      return r.percent != null
        ? L(`Έκπτωση ${value} στις τιμές καταλόγου, ${scope}`, `${value} off catalogue prices, ${scope}`)
        : L(`Έκπτωση ${value} ανά προϊόν στις τιμές καταλόγου, ${scope}`, `${value} off each item's catalogue price, ${scope}`)
    }
    case 'order_discount': {
      const min = r.min_order_cents ? L(` για παραγγελίες από ${m(r.min_order_cents)}`, ` on orders of ${m(r.min_order_cents)} or more`) : ''
      return L(`Έκπτωση ${value} σε κάθε παραγγελία υπαλλήλου${min}`, `${value} off each employee order${min}`)
    }
    case 'benefit_invoice_discount': {
      if (r.percent != null) return L(`Έκπτωση ${value} στην παροχή που τιμολογείται στην εταιρεία`, `${value} off the benefit invoiced to the company`)
      return r.amount_unit === 'per_benefit_day'
        ? L(`Έκπτωση ${value} στο τιμολόγιο ανά υπάλληλο και ημέρα χρήσης παροχής`, `${value} off the invoice per employee per day the benefit is used`)
        : L(`Έκπτωση ${value} στο τιμολόγιο ανά παραγγελία με παροχή`, `${value} off the invoice per order that uses the benefit`)
    }
    case 'minimum_commitment': {
      const per = r.period ? PERIOD[r.period][lang] : '?'
      const amount = r.min_basis === 'orders_x_benefit'
        ? L(`${r.min_orders ?? '?'} παραγγελίες × ημερήσια παροχή`, `${r.min_orders ?? '?'} orders × the daily benefit`)
        : m(r.amount_cents)
      const days = r.counts_on === 'company_calendar'
        ? L('μετρώνται οι εργάσιμες του ημερολογίου της εταιρείας', "counting the company's calendar workdays")
        : r.counts_on === 'company_calendar_plus_order_days'
          ? L('μετρώνται οι εργάσιμες του ημερολογίου και κάθε ημέρα με παραγγελίες', "counting calendar workdays plus any day with orders")
          : L('μετρώνται μόνο ημέρες με τουλάχιστον μία παραγγελία', 'counting only days with at least one order')
      return L(`Ελάχιστη χρέωση ${amount} ανά ${per} · ${days}`, `Minimum ${amount} per ${per} · ${days}`)
    }
    case 'loyalty':
      return L(`Επιβράβευση: ${m(r.earn_cents)} πίστωση για κάθε ${m(r.spend_cents)} δαπάνης (από τον προμηθευτή, μετά την παροχή)`,
        `Loyalty: ${m(r.earn_cents)} credit for every ${m(r.spend_cents)} spent (vendor-funded, used after the benefit)`)
  }
}

export function ruleDates(r: Pick<DealRuleView, 'valid_from' | 'valid_to'>, today: string, lang: Lang): string {
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  if (r.valid_to && r.valid_to < today) return `${fmtDate(r.valid_from, lang)} – ${fmtDate(r.valid_to, lang)}`
  if (r.valid_from > today) return r.valid_to ? L(`${fmtDate(r.valid_from, lang)} – ${fmtDate(r.valid_to, lang)}`, `${fmtDate(r.valid_from, lang)} – ${fmtDate(r.valid_to, lang)}`) : L(`από ${fmtDate(r.valid_from, lang)}`, `from ${fmtDate(r.valid_from, lang)}`)
  return r.valid_to ? L(`έως ${fmtDate(r.valid_to, lang)} (από ${fmtDate(r.valid_from, lang)})`, `until ${fmtDate(r.valid_to, lang)} (since ${fmtDate(r.valid_from, lang)})`) : L(`από ${fmtDate(r.valid_from, lang)}`, `since ${fmtDate(r.valid_from, lang)}`)
}

export type RuleState = 'active' | 'upcoming' | 'ended'
export function ruleState(r: Pick<DealRuleView, 'valid_from' | 'valid_to'>, today: string): RuleState {
  if (r.valid_to && r.valid_to < today) return 'ended'
  if (r.valid_from > today) return 'upcoming'
  return 'active'
}
