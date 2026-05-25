// cf-vendors — the vendor relationships for a company (via matchmaking agreements).
//
// GET /api/cf-vendors?companyId=<uuid>  (Authorization: Bearer)
//   - super_admin → any company; company_admin → own
//
// Returns each active/known agreement with: vendor, discount, terms, GO store ids,
// delivery windows. Read-only — this is what a company sees about who feeds them.

import type { Context } from '@netlify/functions'
import { ok, badRequest, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'

type AgreementRow = {
  id: string
  status: string
  sticker_mode: string
  reusable_containers: string
  start_date: string
  end_date: string | null
  vendors: { id: string; name: string; legal_name: string | null; discount_percentage: number; discount_applies_to: string; tags: string[] | null } | null
  agreement_offices: { delivery_time_from: string; delivery_time_to: string }[] | null
  agreement_shops: { gonnaorder_shop_id: string }[] | null
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'GET') return methodNotAllowed(['GET'])
  try {
    const caller = await getCaller(req)
    if (!caller || (caller.role !== 'super_admin' && caller.role !== 'company_admin')) {
      return forbidden('Admins only')
    }
    const url = new URL(req.url)
    const companyId = caller.role === 'company_admin' ? caller.companyId : url.searchParams.get('companyId')
    if (!companyId) return badRequest('companyId required')

    const sb = supabaseAdmin()
    const { data, error } = await sb
      .from('matchmaking_agreements')
      .select(
        'id, status, sticker_mode, reusable_containers, start_date, end_date, ' +
        'vendors(id, name, legal_name, discount_percentage, discount_applies_to, tags), ' +
        'agreement_offices(delivery_time_from, delivery_time_to), ' +
        'agreement_shops(gonnaorder_shop_id)',
      )
      .eq('company_id', companyId)
      .order('start_date', { ascending: false })
    if (error) throw new Error(error.message)

    const rows = (data ?? []) as unknown as AgreementRow[]
    const vendors = rows.map((a) => ({
      agreementId: a.id,
      status: a.status,
      stickerMode: a.sticker_mode,
      reusableContainers: a.reusable_containers,
      startDate: a.start_date,
      endDate: a.end_date,
      vendor: a.vendors
        ? {
            id: a.vendors.id,
            name: a.vendors.name,
            legalName: a.vendors.legal_name,
            discountPercentage: a.vendors.discount_percentage,
            discountAppliesTo: a.vendors.discount_applies_to,
            tags: a.vendors.tags ?? [],
          }
        : null,
      deliveryWindows: (a.agreement_offices ?? []).map((o) => ({ from: o.delivery_time_from, to: o.delivery_time_to })),
      shopIds: (a.agreement_shops ?? []).map((s) => s.gonnaorder_shop_id),
    }))
    return ok({ vendors })
  } catch (e) {
    return errorResponse(e)
  }
}
