// cf-employees — list + create employees for a company.
//
// GET  /api/cf-employees?companyId=<uuid>            → list
// POST /api/cf-employees  { companyId, display_name, email?, external_ref? }  → create
//   - super_admin → any company (companyId required)
//   - company_admin → own company (companyId ignored/forced)
//
// Writes via service role; authz enforced here.

import type { Context } from '@netlify/functions'
import { ok, badRequest, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'

export default async (req: Request, _ctx: Context) => {
  try {
    const caller = await getCaller(req)
    if (!caller || (caller.role !== 'super_admin' && caller.role !== 'company_admin')) {
      return forbidden('Admins only')
    }
    const sb = supabaseAdmin()

    const resolveCompany = (bodyOrQuery: string | null): string | null =>
      caller.role === 'company_admin' ? caller.companyId : bodyOrQuery

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const companyId = resolveCompany(url.searchParams.get('companyId'))
      if (!companyId) return badRequest('companyId required')
      const { data, error } = await sb
        .from('employees')
        .select('id, display_name, email, external_ref, status, group_id, created_at')
        .eq('company_id', companyId)
        .order('display_name')
      if (error) throw new Error(error.message)
      return ok({ employees: data ?? [] })
    }

    if (req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as {
        companyId?: string; display_name?: string; email?: string; external_ref?: string
      }
      const companyId = resolveCompany(body.companyId ?? null)
      if (!companyId) return badRequest('companyId required')
      if (!body.display_name?.trim()) return badRequest('display_name required')

      // default office (if the company has one) so deliveries route correctly
      const { data: office } = await sb
        .from('company_offices').select('id').eq('company_id', companyId).eq('is_default', true).maybeSingle()

      const row = {
        company_id: companyId,
        display_name: body.display_name.trim(),
        email: body.email?.trim() || null,
        external_ref: body.external_ref?.trim() || null,
        default_office_id: office?.id ?? null,
        status: 'active',
      }
      const { data, error } = await sb.from('employees').insert(row).select('id, display_name, email, external_ref, status').single()
      if (error) {
        if (error.message.includes('duplicate') || error.code === '23505') {
          return badRequest('An employee with that email or voucher code already exists in this company')
        }
        throw new Error(error.message)
      }
      return ok({ employee: data })
    }

    return methodNotAllowed(['GET', 'POST'])
  } catch (e) {
    return errorResponse(e)
  }
}
