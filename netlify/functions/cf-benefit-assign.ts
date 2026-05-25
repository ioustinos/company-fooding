// cf-benefit-assign — assign a benefit to employees.
//
// POST /api/cf-benefit-assign  { benefitId, target: 'all' | 'employee', employeeId? }
//   - 'all'      → assign to every active employee in the benefit's company
//   - 'employee' → assign to one employee
//   Idempotent: an employee already actively assigned to the benefit is skipped.
//   Sets gonnaorder_voucher_code = employee.external_ref (the voucher convention),
//   so the assignment ties to that employee's GonnaOrder orders.
//
// Authz: super_admin (any) or company_admin (own company's benefit only).

import type { Context } from '@netlify/functions'
import { ok, badRequest, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') return methodNotAllowed(['POST'])
  try {
    const caller = await getCaller(req)
    if (!caller || (caller.role !== 'super_admin' && caller.role !== 'company_admin')) {
      return forbidden('Admins only')
    }
    const b = (await req.json().catch(() => ({}))) as { benefitId?: string; target?: string; employeeId?: string }
    if (!b.benefitId) return badRequest('benefitId required')
    const target = b.target ?? 'all'

    const sb = supabaseAdmin()

    // Resolve the benefit's company + verify access.
    const { data: benefit, error: benErr } = await sb
      .from('benefits').select('id, company_id').eq('id', b.benefitId).maybeSingle()
    if (benErr) throw new Error(benErr.message)
    if (!benefit) return badRequest('benefit not found')
    if (caller.role === 'company_admin' && benefit.company_id !== caller.companyId) {
      return forbidden('Not your benefit')
    }

    // Employees already actively assigned (to skip).
    const { data: existing } = await sb
      .from('benefit_assignments')
      .select('employee_id').eq('benefit_id', b.benefitId).is('unassigned_at', null)
    const already = new Set((existing ?? []).map((r) => r.employee_id))

    // Candidate employees.
    let empQuery = sb.from('employees')
      .select('id, external_ref')
      .eq('company_id', benefit.company_id)
      .eq('status', 'active')
    if (target === 'employee') {
      if (!b.employeeId) return badRequest('employeeId required for target=employee')
      empQuery = empQuery.eq('id', b.employeeId)
    } else if (target !== 'all') {
      return badRequest("target must be 'all' or 'employee'")
    }
    const { data: emps, error: empErr } = await empQuery
    if (empErr) throw new Error(empErr.message)

    const toInsert = (emps ?? [])
      .filter((e) => !already.has(e.id))
      .map((e) => ({
        benefit_id: b.benefitId!,
        employee_id: e.id,
        gonnaorder_voucher_code: e.external_ref ?? null,
      }))

    let assigned = 0
    if (toInsert.length > 0) {
      const { error: insErr, count } = await sb
        .from('benefit_assignments').insert(toInsert, { count: 'exact' })
      if (insErr) throw new Error(insErr.message)
      assigned = count ?? toInsert.length
    }

    return ok({ assigned, skipped: (emps?.length ?? 0) - toInsert.length, target })
  } catch (e) {
    return errorResponse(e)
  }
}
