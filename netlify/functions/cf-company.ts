// cf-company — company profile + offices CRUD.
//
// GET    /api/cf-company?companyId=<uuid>
//   → { company, offices: [...] }
// PATCH  /api/cf-company                      { companyId, name?, vat_number?, billing_email? }
// POST   /api/cf-company?scope=office         { companyId, label_el, label_en, street?, area?, zip?, is_default? }
// PUT    /api/cf-company?scope=office         { officeId, companyId, label_el?, label_en?, street?, area?, zip?, is_default? }
// DELETE /api/cf-company?scope=office&officeId=<uuid>&companyId=<uuid>
//
// super_admin → any company; company_admin → own company only.

import type { Context } from '@netlify/functions'
import { ok, badRequest, forbidden, methodNotAllowed, errorResponse, notFound } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'

type OfficeBody = {
  officeId?: string
  companyId?: string
  label_el?: string
  label_en?: string
  street?: string | null
  area?: string | null
  zip?: string | null
  is_default?: boolean
}

async function clearOtherDefaults(sb: ReturnType<typeof supabaseAdmin>, companyId: string, exceptId: string | null) {
  const q = sb.from('company_offices').update({ is_default: false }).eq('company_id', companyId).eq('is_default', true)
  const { error } = exceptId ? await q.neq('id', exceptId) : await q
  if (error) throw new Error(error.message)
}

export default async (req: Request, _ctx: Context) => {
  try {
    const caller = await getCaller(req)
    if (!caller || (caller.role !== 'super_admin' && caller.role !== 'company_admin')) {
      return forbidden('Admins only')
    }
    const sb = supabaseAdmin()
    const resolve = (v: string | null | undefined) =>
      caller.role === 'company_admin' ? caller.companyId : (v ?? null)

    const url = new URL(req.url)
    const isOffice = url.searchParams.get('scope') === 'office'

    // ───────── profile endpoints ─────────
    if (!isOffice) {
      if (req.method === 'GET') {
        const companyId = resolve(url.searchParams.get('companyId'))
        if (!companyId) return badRequest('companyId required')
        const { data: company, error: cErr } = await sb
          .from('companies').select('id, name, vat_number, billing_email, status').eq('id', companyId).single()
        if (cErr) throw new Error(cErr.message)
        const { data: offices, error: oErr } = await sb
          .from('company_offices')
          .select('id, label_el, label_en, street, area, zip, is_default')
          .eq('company_id', companyId)
          .order('is_default', { ascending: false })
          .order('label_el', { ascending: true })
        if (oErr) throw new Error(oErr.message)
        return ok({ company, offices: offices ?? [] })
      }

      if (req.method === 'PATCH') {
        const b = (await req.json().catch(() => ({}))) as { companyId?: string; name?: string; vat_number?: string; billing_email?: string }
        const companyId = resolve(b.companyId)
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
    }

    // ───────── office endpoints ─────────
    if (req.method === 'POST') {
      const b = (await req.json().catch(() => ({}))) as OfficeBody
      const companyId = resolve(b.companyId)
      if (!companyId) return badRequest('companyId required')
      const label_el = (b.label_el ?? '').trim()
      const label_en = (b.label_en ?? label_el).trim() || label_el
      if (!label_el) return badRequest('label_el required')

      const row = {
        company_id: companyId,
        label_el,
        label_en,
        street: b.street?.trim() || null,
        area: b.area?.trim() || null,
        zip: b.zip?.trim() || null,
        is_default: b.is_default === true,
      }
      const { data, error } = await sb.from('company_offices').insert(row).select('id, label_el, label_en, street, area, zip, is_default').single()
      if (error) throw new Error(error.message)
      if (row.is_default) await clearOtherDefaults(sb, companyId, data.id)
      return ok({ office: data })
    }

    if (req.method === 'PUT') {
      const b = (await req.json().catch(() => ({}))) as OfficeBody
      if (!b.officeId) return badRequest('officeId required')
      // Scope guard: company_admin may only touch offices in their own company.
      const { data: existing, error: xErr } = await sb
        .from('company_offices').select('id, company_id').eq('id', b.officeId).single()
      if (xErr || !existing) return notFound('office not found')
      if (caller.role === 'company_admin' && existing.company_id !== caller.companyId) return forbidden('wrong company')

      const patch: Record<string, string | boolean | null> = {}
      if (b.label_el !== undefined) { if (!b.label_el.trim()) return badRequest('label_el cannot be empty'); patch.label_el = b.label_el.trim() }
      if (b.label_en !== undefined) patch.label_en = b.label_en.trim() || (patch.label_el as string) || ''
      if (b.street !== undefined) patch.street = b.street?.trim() || null
      if (b.area !== undefined) patch.area = b.area?.trim() || null
      if (b.zip !== undefined) patch.zip = b.zip?.trim() || null
      if (b.is_default !== undefined) patch.is_default = b.is_default === true
      if (Object.keys(patch).length === 0) return badRequest('nothing to update')

      const { data, error } = await sb.from('company_offices').update(patch).eq('id', b.officeId).select('id, label_el, label_en, street, area, zip, is_default').single()
      if (error) throw new Error(error.message)
      if (patch.is_default === true) await clearOtherDefaults(sb, existing.company_id, data.id)
      return ok({ office: data })
    }

    if (req.method === 'DELETE') {
      const officeId = url.searchParams.get('officeId')
      if (!officeId) return badRequest('officeId required')
      const { data: existing, error: xErr } = await sb
        .from('company_offices').select('id, company_id').eq('id', officeId).single()
      if (xErr || !existing) return notFound('office not found')
      if (caller.role === 'company_admin' && existing.company_id !== caller.companyId) return forbidden('wrong company')
      const { error } = await sb.from('company_offices').delete().eq('id', officeId)
      if (error) throw new Error(error.message)
      return ok({ ok: true })
    }

    return methodNotAllowed(['POST', 'PUT', 'DELETE'])
  } catch (e) {
    return errorResponse(e)
  }
}
