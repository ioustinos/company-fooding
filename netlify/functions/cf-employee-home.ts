// cf-employee-home — the employee-facing dashboard data.
//
// GET /api/cf-employee-home   (Authorization: Bearer)
//   - employee role: returns *their* benefits w/ current-cycle used + remaining,
//     recent orders, and the vendors their company is matched to.
//
// Cycle calculation per benefit cadence:
//   monthly  → [first-of-month, first-of-next-month)
//   weekly   → [most-recent-Monday, +7d)
//   daily    → [today, today+1)
//   one_time → [valid_from, valid_to or +∞)
//
// Used = SUM(orders.benefit_applied) where employee_id=me, delivery_date in
// cycle window, status != 'cancelled'. (We don't store benefit_id on orders
// yet — with multiple benefits per employee this attribution is imprecise;
// the trial-period reality is one benefit per employee, so it lands right.)

import type { Context } from '@netlify/functions'
import { ok, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'

type Cadence = 'daily' | 'weekly' | 'monthly' | 'one_time'

function cycleWindow(cadence: Cadence, validFrom: string, validTo: string | null): { from: string; to: string | null } {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  if (cadence === 'daily') {
    const t = new Date(today); const n = new Date(today); n.setDate(t.getDate() + 1)
    return { from: iso(t), to: iso(n) }
  }
  if (cadence === 'weekly') {
    // Monday-anchored
    const d = new Date(today)
    const dow = (d.getDay() + 6) % 7 // 0=Mon
    d.setDate(d.getDate() - dow)
    const end = new Date(d); end.setDate(d.getDate() + 7)
    return { from: iso(d), to: iso(end) }
  }
  if (cadence === 'monthly') {
    const start = new Date(today.getFullYear(), today.getMonth(), 1)
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 1)
    return { from: iso(start), to: iso(end) }
  }
  // one_time
  return { from: validFrom, to: validTo }
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'GET') return methodNotAllowed(['GET'])
  try {
    const caller = await getCaller(req)
    if (!caller) return forbidden('Sign in required')
    if (!caller.employeeId) return forbidden('No employee record linked to this account')

    const sb = supabaseAdmin()

    // 1. The employee record
    const { data: employeeRaw } = await sb
      .from('employees')
      .select('id, company_id, display_name, email, external_ref, status, ' +
              'company_offices:default_office_id(label_el, label_en)')
      .eq('id', caller.employeeId).maybeSingle()
    const employee = employeeRaw as unknown as ({ id: string; company_id: string; display_name: string; email: string | null; external_ref: string | null; status: string; company_offices: { label_el: string | null; label_en: string | null } | null } & Record<string, unknown>) | null
    if (!employee) return forbidden('Employee not found')

    // 2. Active benefit assignments + their rule (for cadence/amount/anchor)
    const { data: assigns } = await sb
      .from('benefit_assignments')
      .select('id, benefit_id, assigned_at, gonnaorder_voucher_code, ' +
              'benefits(id, name_el, name_en, description_el, description_en, credit_amount, status, valid_from, valid_to, ' +
              'benefit_rules(topup_cadence, topup_amount, carryover, daily_cap))')
      .eq('employee_id', caller.employeeId)
      .is('unassigned_at', null)

    // 3. Recent orders (last 20)
    const { data: orders } = await sb
      .from('orders')
      .select('id, delivery_date, subtotal, benefit_applied, topup_amount, status, vendors(name)')
      .eq('employee_id', caller.employeeId)
      .order('delivery_date', { ascending: false })
      .limit(20)

    // 4. Compute per-benefit cycle window + used + remaining
    type AssignRow = {
      id: string; benefit_id: string; gonnaorder_voucher_code: string | null
      benefits: {
        id: string; name_el: string; name_en: string
        description_el: string | null; description_en: string | null
        credit_amount: number; status: string
        valid_from: string; valid_to: string | null
        benefit_rules: { topup_cadence: Cadence; topup_amount: number; carryover: string; daily_cap: number | null }[] | { topup_cadence: Cadence; topup_amount: number; carryover: string; daily_cap: number | null } | null
      } | null
    }
    const out: Array<Record<string, unknown>> = []
    for (const a of (assigns ?? []) as unknown as AssignRow[]) {
      const b = a.benefits
      if (!b || b.status !== 'active') continue
      const rule = Array.isArray(b.benefit_rules) ? b.benefit_rules[0] : b.benefit_rules
      const cadence: Cadence = (rule?.topup_cadence as Cadence) || 'daily'
      const w = cycleWindow(cadence, b.valid_from, b.valid_to)
      // Sum benefit_applied for this employee within the cycle window
      let q = sb.from('orders')
        .select('benefit_applied')
        .eq('employee_id', caller.employeeId)
        .neq('status', 'cancelled')
        .gte('delivery_date', w.from)
      if (w.to) q = q.lt('delivery_date', w.to)
      const { data: cycleOrders } = await q
      const used = (cycleOrders ?? []).reduce((acc: number, o: { benefit_applied: number }) => acc + (o.benefit_applied ?? 0), 0)
      const credit = b.credit_amount
      const remaining = Math.max(0, credit - used)
      out.push({
        assignment_id: a.id,
        voucher_code: a.gonnaorder_voucher_code,
        benefit: {
          id: b.id, name_el: b.name_el, name_en: b.name_en,
          description_el: b.description_el, description_en: b.description_en,
          credit_amount: credit, cadence, daily_cap: rule?.daily_cap ?? null,
          valid_from: b.valid_from, valid_to: b.valid_to,
        },
        cycle: { from: w.from, to: w.to, used, remaining, percent: credit > 0 ? Math.min(100, Math.round((used / credit) * 100)) : 0 },
      })
    }

    // 5. Vendors matched to my company (via agreements)
    const { data: agreements } = await sb
      .from('matchmaking_agreements')
      .select('id, status, sticker_mode, ' +
              'vendors(id, name, legal_name, discount_percentage, discount_applies_to, tags), ' +
              'agreement_offices(delivery_time_from, delivery_time_to), ' +
              'agreement_shops(gonnaorder_shop_id)')
      .eq('company_id', employee.company_id)
      .eq('status', 'active')

    const vendors = (agreements ?? []).map((a) => {
      const r = a as unknown as { id: string; sticker_mode: string; vendors: { id: string; name: string; legal_name: string | null; discount_percentage: number; discount_applies_to: string; tags: string[] | null } | null; agreement_offices: { delivery_time_from: string; delivery_time_to: string }[] | null; agreement_shops: { gonnaorder_shop_id: string }[] | null }
      return {
        agreement_id: r.id,
        sticker_mode: r.sticker_mode,
        vendor: r.vendors,
        windows: (r.agreement_offices ?? []).map((w) => ({ from: w.delivery_time_from, to: w.delivery_time_to })),
        shop_ids: (r.agreement_shops ?? []).map((s) => s.gonnaorder_shop_id),
      }
    })

    return ok({ employee, benefits: out, orders: orders ?? [], vendors })
  } catch (e) {
    return errorResponse(e)
  }
}
