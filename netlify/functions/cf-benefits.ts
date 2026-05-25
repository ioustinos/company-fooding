// cf-benefits — list + create benefits for a company.
//
// GET  /api/cf-benefits?companyId=<uuid>   → list (with their rule cadence)
// POST /api/cf-benefits  {
//        companyId, name_el, name_en, credit_amount_eur, valid_from,
//        topup_cadence ('daily'|'weekly'|'monthly'|'one_time'), carryover ('reset'|'accumulate')
//      } → create benefit + its benefit_rules row
//   - super_admin → any company; company_admin → own
//
// credit_amount is stored in cents. The form sends euros; we ×100 here.

import type { Context } from '@netlify/functions'
import { ok, badRequest, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'

const CADENCES = ['daily', 'weekly', 'monthly', 'one_time']
const CARRYOVERS = ['reset', 'accumulate']

export default async (req: Request, _ctx: Context) => {
  try {
    const caller = await getCaller(req)
    if (!caller || (caller.role !== 'super_admin' && caller.role !== 'company_admin')) {
      return forbidden('Admins only')
    }
    const sb = supabaseAdmin()
    const resolveCompany = (v: string | null) =>
      caller.role === 'company_admin' ? caller.companyId : v

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const companyId = resolveCompany(url.searchParams.get('companyId'))
      if (!companyId) return badRequest('companyId required')
      const { data, error } = await sb
        .from('benefits')
        .select('id, name_el, name_en, credit_amount, currency, status, valid_from, valid_to, ' +
                'benefit_rules(topup_cadence, topup_amount, carryover)')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)

      // attach active-assignment counts per benefit
      const benefits = data ?? []
      if (benefits.length > 0) {
        const ids = benefits.map((b) => b.id)
        const { data: assigns } = await sb
          .from('benefit_assignments')
          .select('benefit_id')
          .in('benefit_id', ids)
          .is('unassigned_at', null)
        const counts = new Map<string, number>()
        for (const a of assigns ?? []) counts.set(a.benefit_id, (counts.get(a.benefit_id) ?? 0) + 1)
        for (const b of benefits as Array<Record<string, unknown>>) b.assigned_count = counts.get(b.id as string) ?? 0
      }
      return ok({ benefits })
    }

    if (req.method === 'POST') {
      const b = (await req.json().catch(() => ({}))) as {
        companyId?: string; name_el?: string; name_en?: string
        credit_amount_eur?: number; valid_from?: string
        topup_cadence?: string; carryover?: string
      }
      const companyId = resolveCompany(b.companyId ?? null)
      if (!companyId) return badRequest('companyId required')
      if (!b.name_el?.trim() || !b.name_en?.trim()) return badRequest('name_el and name_en required')
      const eur = Number(b.credit_amount_eur)
      if (!Number.isFinite(eur) || eur < 0) return badRequest('credit_amount_eur must be a non-negative number')
      const cadence = b.topup_cadence ?? 'daily'
      if (!CADENCES.includes(cadence)) return badRequest(`topup_cadence must be one of ${CADENCES.join(', ')}`)
      const carryover = b.carryover ?? 'reset'
      if (!CARRYOVERS.includes(carryover)) return badRequest(`carryover must be one of ${CARRYOVERS.join(', ')}`)
      const cents = Math.round(eur * 100)

      const { data: benefit, error: benErr } = await sb
        .from('benefits')
        .insert({
          company_id: companyId,
          name_el: b.name_el.trim(),
          name_en: b.name_en.trim(),
          credit_amount: cents,
          valid_from: b.valid_from || new Date().toISOString().slice(0, 10),
          status: 'active',
        })
        .select('id, name_el, name_en, credit_amount, status, valid_from')
        .single()
      if (benErr) throw new Error(benErr.message)

      // Create the rule (cadence + per-tick top-up amount = the credit amount).
      const { error: ruleErr } = await sb.from('benefit_rules').insert({
        benefit_id: benefit!.id,
        topup_cadence: cadence,
        topup_amount: cents,
        carryover,
      })
      if (ruleErr) {
        // roll back the benefit so we don't leave an orphan with no rule
        await sb.from('benefits').delete().eq('id', benefit!.id)
        throw new Error(`benefit_rules: ${ruleErr.message}`)
      }

      return ok({ benefit })
    }

    return methodNotAllowed(['GET', 'POST'])
  } catch (e) {
    return errorResponse(e)
  }
}
