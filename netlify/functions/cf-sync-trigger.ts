// cf-sync-trigger — UI-callable manual sync. Same logic as cf-sync-gonnaorder
// but authenticated with the user's Bearer JWT (super_admin only) instead of
// the CF_ADMIN_TOKEN header. Lets the Reconcile page button fire a backfill
// without anyone having to copy an admin token into curl.
//
// POST /api/cf-sync-trigger
//   body: { since?: 'YYYY-MM-DD', shopId?: string, dryRun?: boolean }
//   defaults: since = today - 30d, dryRun = false (we want it to actually do work)
//   auth: Authorization: Bearer <user JWT>  (super_admin role required)

import type { Context } from '@netlify/functions'
import { ok, badRequest, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { runSync } from './_shared/syncGonnaOrder'

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') return methodNotAllowed(['POST'])
  try {
    const caller = await getCaller(req)
    if (!caller || caller.role !== 'super_admin') return forbidden('super_admin only')

    const b = (await req.json().catch(() => ({}))) as { since?: string; shopId?: string; dryRun?: boolean }
    const sinceDate = b.since ? new Date(b.since) : new Date(Date.now() - 30 * 24 * 3600 * 1000)
    if (Number.isNaN(sinceDate.getTime())) return badRequest(`Invalid 'since': ${b.since}`)

    const summary = await runSync({
      since: sinceDate,
      shopFilter: b.shopId,
      dryRun: b.dryRun === true,   // default false — manual click expects action
    })
    return ok({ ok: true, summary })
  } catch (e) {
    return errorResponse(e)
  }
}
