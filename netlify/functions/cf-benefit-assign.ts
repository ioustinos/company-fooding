// cf-benefit-assign — assign a benefit to employees.
//
// POST /api/cf-benefit-assign  { benefitId, target, employeeId?, employeeIds? }
//   - 'all'       → assign to every active employee in the benefit's company
//   - 'employee'  → assign to one employee (employeeId)
//   - 'employees' → assign to a specific set (employeeIds[]) — used by the
//                   benefit form's "Specific people" picker
//   Idempotent: an employee already actively assigned to the benefit is skipped.
//   Sets gonnaorder_voucher_code = employee.external_ref (the voucher convention),
//   so the assignment ties to that employee's GonnaOrder orders.
//
// Authz: super_admin (any) or company_admin (own company's benefit only).

import type { Context } from '@netlify/functions'
import { ok, badRequest, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'
import { logActivity } from './_shared/activity'

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST' && req.method !== 'DELETE') return methodNotAllowed(['POST', 'DELETE'])
  try {
    const caller = await getCaller(req)
    if (!caller || (caller.role !== 'super_admin' && caller.role !== 'company_admin')) {
      return forbidden('Admins only')
    }

    const sbDel = supabaseAdmin()
    // ---- DELETE: unassign (soft-delete by stamping unassigned_at) ----
    if (req.method === 'DELETE') {
      const d = (await req.json().catch(() => ({}))) as { assignmentId?: string }
      if (!d.assignmentId) return badRequest('assignmentId required')
      // verify access via the parent benefit's company
      const { data: row } = await sbDel.from('benefit_assignments')
        .select('id, benefit_id, benefits(company_id)').eq('id', d.assignmentId).maybeSingle()
      const r = row as unknown as { id: string; benefits: { company_id: string } | null } | null
      if (!r) return badRequest('assignment not found')
      if (caller.role === 'company_admin' && r.benefits?.company_id !== caller.companyId) {
        return forbidden('Not your assignment')
      }
      const { error } = await sbDel.from('benefit_assignments')
        .update({ unassigned_at: new Date().toISOString() }).eq('id', d.assignmentId)
      if (error) throw new Error(error.message)
      void logActivity(sbDel, caller, r.benefits?.company_id ?? null, 'benefit.unassigned', {
        target_type: 'assignment', target_id: d.assignmentId,
        summary_el: 'Παροχή ακυρώθηκε για υπάλληλο',
        summary_en: 'Benefit unassigned from employee',
      })
      return ok({ unassigned: 1 })
    }
    const b = (await req.json().catch(() => ({}))) as
      { benefitId?: string; target?: string; employeeId?: string; employeeIds?: string[] }
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
    } else if (target === 'employees') {
      const ids = (b.employeeIds ?? []).filter(Boolean)
      if (ids.length === 0) return badRequest('employeeIds required for target=employees')
      empQuery = empQuery.in('id', ids)
    } else if (target !== 'all') {
      return badRequest("target must be 'all', 'employee', or 'employees'")
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

    if (assigned > 0) {
      void logActivity(sb, caller, benefit.company_id, target === 'all' ? 'benefit.assigned_all' : 'benefit.assigned_employees', {
        target_type: 'benefit', target_id: b.benefitId,
        summary_el: `Παροχή ανατέθηκε σε ${assigned} ${assigned === 1 ? 'υπάλληλο' : 'υπαλλήλους'}`,
        summary_en: `Benefit assigned to ${assigned} ${assigned === 1 ? 'employee' : 'employees'}`,
        payload: { target, assigned, skipped: (emps?.length ?? 0) - toInsert.length },
      })
    }

    return ok({ assigned, skipped: (emps?.length ?? 0) - toInsert.length, target })
  } catch (e) {
    return errorResponse(e)
  }
}
