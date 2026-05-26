// cf-employees — list, create (single + bulk), edit/deactivate employees.
//
// GET   /api/cf-employees?companyId=<uuid>                 → list
// POST  /api/cf-employees  { companyId, display_name, email?, external_ref? }   → create one
// POST  /api/cf-employees  { companyId, rows: [{display_name,email?,external_ref?}] } → bulk
// PATCH /api/cf-employees  { id, display_name?, email?, external_ref?, status? }  → edit/deactivate
//   - super_admin → any company (companyId required for create); company_admin → own
//
// Writes via service role; authz enforced here.

import type { Context } from '@netlify/functions'
import { ok, badRequest, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'

type InRow = { display_name?: string; email?: string; external_ref?: string }

export default async (req: Request, _ctx: Context) => {
  try {
    const caller = await getCaller(req)
    if (!caller || (caller.role !== 'super_admin' && caller.role !== 'company_admin')) {
      return forbidden('Admins only')
    }
    const sb = supabaseAdmin()
    const resolveCompany = (v: string | null) => (caller.role === 'company_admin' ? caller.companyId : v)

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const id = url.searchParams.get('id')

      // ---- single employee + their active benefits + recent orders ----
      if (id) {
        const { data: e, error: empErr } = await sb
          .from('employees')
          .select('id, company_id, display_name, email, external_ref, status, group_id, default_office_id, created_at, ' +
                  'company_offices:default_office_id(label_el, label_en)')
          .eq('id', id)
          .maybeSingle()
        if (empErr) throw new Error(empErr.message)
        if (!e) return badRequest('employee not found')
        const emp = e as unknown as { company_id: string; company_offices: { label_el: string | null; label_en: string | null } | null } & Record<string, unknown>
        if (caller.role === 'company_admin' && emp.company_id !== caller.companyId) return forbidden('Not your employee')

        // active benefit assignments with benefit name
        const { data: assigns } = await sb
          .from('benefit_assignments')
          .select('id, benefit_id, assigned_at, gonnaorder_voucher_code, ' +
                  'benefits(name_el, name_en, credit_amount, status, ' +
                  'benefit_rules(topup_cadence))')
          .eq('employee_id', id)
          .is('unassigned_at', null)

        // recent orders (last 30)
        const { data: orders } = await sb
          .from('orders')
          .select('id, delivery_date, subtotal, benefit_applied, topup_amount, vendors(name)')
          .eq('employee_id', id)
          .order('delivery_date', { ascending: false })
          .limit(30)

        const office = { label_el: emp.company_offices?.label_el ?? null, label_en: emp.company_offices?.label_en ?? null }
        return ok({
          employee: { ...emp, office, company_offices: undefined },
          assignments: assigns ?? [],
          orders: orders ?? [],
        })
      }

      const companyId = resolveCompany(url.searchParams.get('companyId'))
      if (!companyId) return badRequest('companyId required')

      const { data, error } = await sb
        .from('employees')
        .select('id, display_name, email, external_ref, status, group_id, default_office_id, created_at, ' +
                'company_offices:default_office_id(label_el, label_en)')
        .eq('company_id', companyId)
        .order('display_name')
      if (error) throw new Error(error.message)
      const emps = (data ?? []) as unknown as Array<{ id: string; default_office_id: string | null; company_offices: { label_el: string | null; label_en: string | null } | null } & Record<string, unknown>>

      if (emps.length > 0) {
        const ids = emps.map((e) => e.id)
        // active benefit assignments per employee
        const { data: aRows } = await sb.from('benefit_assignments')
          .select('employee_id').in('employee_id', ids).is('unassigned_at', null)
        const benefitsCount = new Map<string, number>()
        for (const a of (aRows ?? []) as Array<{ employee_id: string }>) benefitsCount.set(a.employee_id, (benefitsCount.get(a.employee_id) ?? 0) + 1)
        // lifetime spend per employee (orders.subtotal)
        const { data: oRows } = await sb.from('orders')
          .select('employee_id, subtotal').in('employee_id', ids)
        const spend = new Map<string, number>()
        for (const o of (oRows ?? []) as Array<{ employee_id: string; subtotal: number }>) spend.set(o.employee_id, (spend.get(o.employee_id) ?? 0) + (o.subtotal ?? 0))

        for (const e of emps as Array<Record<string, unknown> & { id: string; company_offices: { label_el: string | null; label_en: string | null } | null }>) {
          e.benefits_count = benefitsCount.get(e.id) ?? 0
          e.spend = spend.get(e.id) ?? 0
          e.office_label_el = e.company_offices?.label_el ?? null
          e.office_label_en = e.company_offices?.label_en ?? null
          delete (e as Record<string, unknown>).company_offices
        }
      }
      return ok({ employees: emps })
    }

    if (req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as
        { companyId?: string; rows?: InRow[] } & InRow
      const companyId = resolveCompany(body.companyId ?? null)
      if (!companyId) return badRequest('companyId required')

      // default office for delivery routing
      const { data: office } = await sb
        .from('company_offices').select('id').eq('company_id', companyId).eq('is_default', true).maybeSingle()
      const officeId = office?.id ?? null

      const toRow = (r: InRow) => ({
        company_id: companyId,
        display_name: (r.display_name ?? '').trim(),
        email: r.email?.trim() || null,
        external_ref: r.external_ref?.trim() || null,
        default_office_id: officeId,
        status: 'active',
      })

      // BULK
      if (Array.isArray(body.rows)) {
        const valid = body.rows.map(toRow).filter((r) => r.display_name)
        if (valid.length === 0) return badRequest('No valid rows (display_name required on each)')
        // upsert on (company_id, lower(external_ref)) would be ideal; insert + skip dups
        const results = { inserted: 0, skipped: 0, errors: [] as string[] }
        for (const r of valid) {
          const { error } = await sb.from('employees').insert(r)
          if (error) {
            if (error.code === '23505' || error.message.includes('duplicate')) results.skipped++
            else results.errors.push(`${r.display_name}: ${error.message}`)
          } else results.inserted++
        }
        return ok({ bulk: results })
      }

      // SINGLE
      const row = toRow(body)
      if (!row.display_name) return badRequest('display_name required')
      const { data, error } = await sb.from('employees').insert(row)
        .select('id, display_name, email, external_ref, status').single()
      if (error) {
        if (error.code === '23505' || error.message.includes('duplicate')) {
          return badRequest('An employee with that email or voucher code already exists in this company')
        }
        throw new Error(error.message)
      }
      return ok({ employee: data })
    }

    if (req.method === 'PATCH') {
      const b = (await req.json().catch(() => ({}))) as
        { id?: string; display_name?: string; email?: string; external_ref?: string; status?: string }
      if (!b.id) return badRequest('id required')

      // company_admin may only edit employees in their own company
      if (caller.role === 'company_admin') {
        const { data: emp } = await sb.from('employees').select('company_id').eq('id', b.id).maybeSingle()
        if (!emp || emp.company_id !== caller.companyId) return forbidden('Not your employee')
      }

      const patch: Record<string, string | null> = {}
      if (b.display_name !== undefined) { if (!b.display_name.trim()) return badRequest('display_name cannot be empty'); patch.display_name = b.display_name.trim() }
      if (b.email !== undefined) patch.email = b.email.trim() || null
      if (b.external_ref !== undefined) patch.external_ref = b.external_ref.trim() || null
      if (b.status !== undefined) { if (!['active', 'inactive'].includes(b.status)) return badRequest('status must be active|inactive'); patch.status = b.status }
      if (Object.keys(patch).length === 0) return badRequest('nothing to update')

      const { data, error } = await sb.from('employees').update(patch).eq('id', b.id)
        .select('id, display_name, email, external_ref, status').single()
      if (error) {
        if (error.code === '23505') return badRequest('Voucher code already used by another employee')
        throw new Error(error.message)
      }
      return ok({ employee: data })
    }

    return methodNotAllowed(['GET', 'POST', 'PATCH'])
  } catch (e) {
    return errorResponse(e)
  }
}
