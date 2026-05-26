// cf-benefits — list / get-one / create / update benefits for a company.
//
// GET  /api/cf-benefits?companyId=<uuid>     → list (with rule + assigned_count)
// GET  /api/cf-benefits?id=<uuid>            → single benefit + rule + assigned ids
// POST /api/cf-benefits   { …full option set }            → create benefit + rule
// PUT  /api/cf-benefits   { id, …full option set }        → update benefit + rule
//   - super_admin → any company; company_admin → own
//
// Money fields arrive in euros and are stored in cents (×100). Optional caps
// (daily_cap, per_order_min/max) are nullable. days_of_week is 1..7 (Mon..Sun),
// null/empty = all days.
//
// NOTE: the top-up *anchor* (day-of-month / day-of-week / time) is captured by
// the form but not yet persisted — it needs migration 16 (benefit_rules anchor
// columns) which awaits approval. The scheduler is still in dry-run, so anchor
// is cosmetic until then.

import type { Context } from '@netlify/functions'
import { ok, badRequest, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'
import { logActivity } from './_shared/activity'

const CADENCES = ['daily', 'weekly', 'monthly', 'one_time']
const CARRYOVERS = ['reset', 'accumulate']

type Body = {
  companyId?: string; id?: string
  name_el?: string; name_en?: string
  description_el?: string; description_en?: string
  credit_amount_eur?: number; valid_from?: string; valid_to?: string
  topup_cadence?: string; carryover?: string
  daily_cap_eur?: number | null; per_order_min_eur?: number | null; per_order_max_eur?: number | null
  days_of_week?: number[] | null
  // anchor — when the top-up fires within the cadence
  topup_dom?: number | null; topup_dom_eom?: boolean
  topup_dow?: number | null; topup_time?: string | null
  // voucher style at GO
  voucher_discount_type?: 'absolute' | 'percentile'
  voucher_discount_pct?: number | null
}

// Coerce anchor fields based on cadence — only set the fields that apply to
// the chosen cadence; null out the others so the row reads cleanly.
function normAnchor(b: Body, cadence: string) {
  const time = b.topup_time && /^\d{2}:\d{2}/.test(b.topup_time) ? b.topup_time.slice(0, 5) + ':00' : null
  if (cadence === 'monthly') {
    const eom = Boolean(b.topup_dom_eom)
    const dom = eom ? null : (Number.isInteger(b.topup_dom) ? Math.max(1, Math.min(31, Number(b.topup_dom))) : null)
    return { topup_dom: dom, topup_dom_eom: eom, topup_dow: null, topup_time: time }
  }
  if (cadence === 'weekly') {
    const dow = Number.isInteger(b.topup_dow) ? Math.max(1, Math.min(7, Number(b.topup_dow))) : null
    return { topup_dom: null, topup_dom_eom: false, topup_dow: dow, topup_time: time }
  }
  if (cadence === 'daily') {
    return { topup_dom: null, topup_dom_eom: false, topup_dow: null, topup_time: time }
  }
  // one_time — anchor is unused; valid_from + time at most
  return { topup_dom: null, topup_dom_eom: false, topup_dow: null, topup_time: time }
}

// euros → cents, or null when blank/invalid (used for optional caps)
function eurToCentsOpt(v: number | null | undefined): number | null {
  if (v === null || v === undefined || v === ('' as unknown)) return null
  const n = Number(v)
  if (!Number.isFinite(n) || n < 0) return null
  return Math.round(n * 100)
}

function normDays(d: number[] | null | undefined): number[] | null {
  if (!Array.isArray(d) || d.length === 0 || d.length === 7) return null // null = all days
  const set = [...new Set(d.filter((n) => Number.isInteger(n) && n >= 1 && n <= 7))].sort((a, b) => a - b)
  return set.length === 0 || set.length === 7 ? null : set
}

function validateCore(b: Body) {
  if (!b.name_el?.trim() || !b.name_en?.trim()) return 'name_el and name_en required'
  const eur = Number(b.credit_amount_eur)
  if (!Number.isFinite(eur) || eur < 0) return 'credit_amount_eur must be a non-negative number'
  const cadence = b.topup_cadence ?? 'daily'
  if (!CADENCES.includes(cadence)) return `topup_cadence must be one of ${CADENCES.join(', ')}`
  const carryover = b.carryover ?? 'reset'
  if (!CARRYOVERS.includes(carryover)) return `carryover must be one of ${CARRYOVERS.join(', ')}`
  return null
}

export default async (req: Request, _ctx: Context) => {
  try {
    const caller = await getCaller(req)
    if (!caller || (caller.role !== 'super_admin' && caller.role !== 'company_admin')) {
      return forbidden('Admins only')
    }
    const sb = supabaseAdmin()
    const resolveCompany = (v: string | null) =>
      caller.role === 'company_admin' ? caller.companyId : v

    // ---- GET ----
    if (req.method === 'GET') {
      const url = new URL(req.url)
      const id = url.searchParams.get('id')

      // single benefit (for the edit page)
      if (id) {
        const { data, error } = await sb
          .from('benefits')
          .select('id, company_id, name_el, name_en, description_el, description_en, ' +
                  'credit_amount, currency, status, valid_from, valid_to, ' +
                  'benefit_rules(topup_cadence, topup_amount, carryover, daily_cap, per_order_min, per_order_max, days_of_week, topup_dom, topup_dom_eom, topup_dow, topup_time, voucher_discount_type, voucher_discount_pct)')
          .eq('id', id)
          .maybeSingle()
        if (error) throw new Error(error.message)
        const b = data as unknown as ({ company_id: string } & Record<string, unknown>) | null
        if (!b) return badRequest('benefit not found')
        if (caller.role === 'company_admin' && b.company_id !== caller.companyId) {
          return forbidden('Not your benefit')
        }
        const { data: assigns } = await sb
          .from('benefit_assignments')
          .select('employee_id')
          .eq('benefit_id', id)
          .is('unassigned_at', null)
        const assignedEmployeeIds = (assigns ?? []).map((a) => a.employee_id).filter(Boolean)
        return ok({ benefit: b, assignedEmployeeIds })
      }

      // list
      const companyId = resolveCompany(url.searchParams.get('companyId'))
      if (!companyId) return badRequest('companyId required')
      const { data, error } = await sb
        .from('benefits')
        .select('id, name_el, name_en, description_el, description_en, credit_amount, currency, ' +
                'status, valid_from, valid_to, ' +
                'benefit_rules(topup_cadence, topup_amount, carryover, daily_cap, per_order_min, per_order_max, days_of_week, topup_dom, topup_dom_eom, topup_dow, topup_time, voucher_discount_type, voucher_discount_pct)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)

      const benefits = (data ?? []) as unknown as Array<{ id: string } & Record<string, unknown>>
      if (benefits.length > 0) {
        const ids = benefits.map((b) => b.id)
        const { data: assigns } = await sb
          .from('benefit_assignments')
          .select('benefit_id')
          .in('benefit_id', ids)
          .is('unassigned_at', null)
        const counts = new Map<string, number>()
        for (const a of (assigns ?? []) as Array<{ benefit_id: string }>) counts.set(a.benefit_id, (counts.get(a.benefit_id) ?? 0) + 1)
        for (const b of benefits) b.assigned_count = counts.get(b.id) ?? 0
      }
      return ok({ benefits })
    }

    // ---- POST (create) ----
    if (req.method === 'POST') {
      const b = (await req.json().catch(() => ({}))) as Body
      const companyId = resolveCompany(b.companyId ?? null)
      if (!companyId) return badRequest('companyId required')
      const verr = validateCore(b)
      if (verr) return badRequest(verr)

      const cents = Math.round(Number(b.credit_amount_eur) * 100)
      const cadence = b.topup_cadence ?? 'daily'
      const carryover = b.carryover ?? 'reset'

      const { data: benefit, error: benErr } = await sb
        .from('benefits')
        .insert({
          company_id: companyId,
          name_el: b.name_el!.trim(),
          name_en: b.name_en!.trim(),
          description_el: b.description_el?.trim() || null,
          description_en: b.description_en?.trim() || null,
          credit_amount: cents,
          valid_from: b.valid_from || new Date().toISOString().slice(0, 10),
          valid_to: b.valid_to || null,
          status: 'active',
        })
        .select('id, name_el, name_en, credit_amount, status, valid_from')
        .single()
      if (benErr) throw new Error(benErr.message)

      const anchor = normAnchor(b, cadence)
      const vType = b.voucher_discount_type === 'percentile' ? 'percentile' : 'absolute'
      const vPct = vType === 'percentile' && Number.isInteger(b.voucher_discount_pct)
        ? Math.max(1, Math.min(100, Number(b.voucher_discount_pct))) : null
      const { error: ruleErr } = await sb.from('benefit_rules').insert({
        benefit_id: benefit!.id,
        topup_cadence: cadence,
        topup_amount: cents,
        carryover,
        daily_cap: eurToCentsOpt(b.daily_cap_eur),
        per_order_min: eurToCentsOpt(b.per_order_min_eur),
        per_order_max: eurToCentsOpt(b.per_order_max_eur),
        days_of_week: normDays(b.days_of_week),
        voucher_discount_type: vType,
        voucher_discount_pct: vPct,
        ...anchor,
      })
      if (ruleErr) {
        await sb.from('benefits').delete().eq('id', benefit!.id) // roll back orphan
        throw new Error(`benefit_rules: ${ruleErr.message}`)
      }
      void logActivity(sb, caller, companyId, 'benefit.created', {
        target_type: 'benefit', target_id: benefit!.id,
        summary_el: `Δημιουργήθηκε παροχή "${b.name_el!.trim()}" (${(cents / 100).toFixed(2)}€ ${cadence})`,
        summary_en: `Created benefit "${b.name_en!.trim()}" (${(cents / 100).toFixed(2)}€ ${cadence})`,
        payload: { name_el: b.name_el, name_en: b.name_en, credit_amount: cents, cadence, carryover },
      })
      return ok({ benefit })
    }

    // ---- PUT (update) ----
    if (req.method === 'PUT') {
      const b = (await req.json().catch(() => ({}))) as Body
      if (!b.id) return badRequest('id required')
      const verr = validateCore(b)
      if (verr) return badRequest(verr)

      // verify access
      const { data: existing, error: exErr } = await sb
        .from('benefits').select('id, company_id').eq('id', b.id).maybeSingle()
      if (exErr) throw new Error(exErr.message)
      if (!existing) return badRequest('benefit not found')
      if (caller.role === 'company_admin' && existing.company_id !== caller.companyId) {
        return forbidden('Not your benefit')
      }

      const cents = Math.round(Number(b.credit_amount_eur) * 100)
      const cadence = b.topup_cadence ?? 'daily'
      const carryover = b.carryover ?? 'reset'

      const { error: upErr } = await sb.from('benefits').update({
        name_el: b.name_el!.trim(),
        name_en: b.name_en!.trim(),
        description_el: b.description_el?.trim() || null,
        description_en: b.description_en?.trim() || null,
        credit_amount: cents,
        valid_from: b.valid_from || undefined,
        valid_to: b.valid_to || null,
      }).eq('id', b.id)
      if (upErr) throw new Error(upErr.message)

      // upsert the rule (one per benefit, unique benefit_id)
      const anchor = normAnchor(b, cadence)
      const vType = b.voucher_discount_type === 'percentile' ? 'percentile' : 'absolute'
      const vPct = vType === 'percentile' && Number.isInteger(b.voucher_discount_pct)
        ? Math.max(1, Math.min(100, Number(b.voucher_discount_pct))) : null
      const { error: ruleErr } = await sb.from('benefit_rules').upsert({
        benefit_id: b.id,
        topup_cadence: cadence,
        topup_amount: cents,
        carryover,
        daily_cap: eurToCentsOpt(b.daily_cap_eur),
        per_order_min: eurToCentsOpt(b.per_order_min_eur),
        per_order_max: eurToCentsOpt(b.per_order_max_eur),
        days_of_week: normDays(b.days_of_week),
        voucher_discount_type: vType,
        voucher_discount_pct: vPct,
        ...anchor,
      }, { onConflict: 'benefit_id' })
      if (ruleErr) throw new Error(`benefit_rules: ${ruleErr.message}`)

      void logActivity(sb, caller, existing.company_id as string, 'benefit.updated', {
        target_type: 'benefit', target_id: b.id,
        summary_el: `Ενημερώθηκε παροχή "${b.name_el!.trim()}"`,
        summary_en: `Updated benefit "${b.name_en!.trim()}"`,
        payload: { name_el: b.name_el, name_en: b.name_en, credit_amount: cents, cadence, carryover },
      })
      return ok({ id: b.id })
    }

    // ---- PATCH (status-only) — used by the Archive button on the benefits list ----
    if (req.method === 'PATCH') {
      const b = (await req.json().catch(() => ({}))) as { id?: string; status?: 'active' | 'archived' }
      if (!b.id) return badRequest('id required')
      if (!b.status || !['active', 'archived'].includes(b.status)) return badRequest("status must be 'active' or 'archived'")
      const { data: existing } = await sb.from('benefits').select('id, company_id').eq('id', b.id).maybeSingle()
      if (!existing) return badRequest('benefit not found')
      if (caller.role === 'company_admin' && existing.company_id !== caller.companyId) return forbidden('Not your benefit')
      const { error } = await sb.from('benefits').update({ status: b.status }).eq('id', b.id)
      if (error) throw new Error(error.message)
      void logActivity(sb, caller, existing.company_id as string, b.status === 'archived' ? 'benefit.archived' : 'benefit.reactivated', {
        target_type: 'benefit', target_id: b.id,
        summary_el: b.status === 'archived' ? 'Παροχή αρχειοθετήθηκε' : 'Παροχή ενεργοποιήθηκε',
        summary_en: b.status === 'archived' ? 'Benefit archived' : 'Benefit reactivated',
      })
      return ok({ id: b.id, status: b.status })
    }

    return methodNotAllowed(['GET', 'POST', 'PUT', 'PATCH'])
  } catch (e) {
    return errorResponse(e)
  }
}
