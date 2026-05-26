// cf-webhook-events — list recent inbound GO webhook events for the System
// monitor page. Lets admins eyeball what's arriving + what got rejected.
//
// GET /api/cf-webhook-events?limit=100   (Authorization: Bearer)

import type { Context } from '@netlify/functions'
import { ok, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'GET') return methodNotAllowed(['GET'])
  try {
    const caller = await getCaller(req)
    if (!caller || (caller.role !== 'super_admin' && caller.role !== 'company_admin')) {
      return forbidden('Admins only')
    }
    const url = new URL(req.url)
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') ?? 100)))
    const sb = supabaseAdmin()
    const { data, error } = await sb.from('webhook_events')
      .select('id, source, event_type, external_order_id, dedupe_key, processed, error, received_at, payload')
      .order('received_at', { ascending: false })
      .limit(limit)
    if (error) throw new Error(error.message)
    return ok({ events: data ?? [] })
  } catch (e) {
    return errorResponse(e)
  }
}
