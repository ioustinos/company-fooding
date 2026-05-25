// cf-company — company profile + offices (read), and profile edit (write).
//
// GET   /api/cf-company?companyId=<uuid>
// PATCH /api/cf-company  { companyId, name?, vat_number?, billing_email? }
//   - super_admin → any company; company_admin → own
//
// Returns { company: {id,name,vat_number,billing_email,status}, offices: [...] }

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
    const resolve = (v: string | null) => (caller.role === 'company_admin' ? caller.companyId : v)

    if (req.method === 'GET') {
      const url = new URL(req.url)
      const companyId = resolve(url.searchParams.get('companyId'))
      if (!companyId) return badRequest('companyId required')
      const { data: company, error: cErr } = await sb
        .from('companies').select('id, name, vat_number, billing_email, status').eq('id', companyId).single()
      if (cErr) throw new Error(cErr.message)
      const { data: offices, error: oErr } = await sb
        .from('company_offices').select('id, label_el, label_en, street, area, zip, is_default').eq('company_id', companyId).order('is_default', { ascending: false })
      if (oErr) throw new Error(oErr.message)
      return ok({ company, offices: offices ?? [] })
    }

    if (req.method === 'PATCH') {
      const b = (await req.json().catch(() => ({}))) as { companyId?: string; name?: string; vat_number?: string; billing_email?: string }
      const companyId = resolve(b.companyId ?? null)
      if (!companyId) return badRequest('companyId required')
      const patch: Record<string, string | null> = {}
      if (b.name !== undefined) { if (!b.name.trim()) return badRequest('name cannot be empty'); patch.name = b.name.trim() }
      if (b.vat_number !== undefined) patch.vat_number = b.vat_number.trim() || null
      if (b.billing_email !== undefined) patch.billing_email = b.billing_email.trim() || null
      if (Object.keys(patch).length === 0) return badRequest('nothing to update')
      const { data, error } = await sb.from('companies').update(patch).eq('id', companyId).select('id, name, vat_number, billing_email, status').single()
      if (error) throw new Error(error.message)
      return ok({ company: data })
    }

    return methodNotAllowed(['GET', 'PATCH'])
  } catch (e) {
    return errorResponse(e)
  }
}
