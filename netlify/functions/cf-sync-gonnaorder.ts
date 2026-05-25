// cf-sync-gonnaorder — manual / bootstrap HTTP trigger for the GonnaOrder sync.
//
// Endpoint: POST /api/cf-sync-gonnaorder
// Body (all optional):
//   { "since": "2026-03-01", "shopId": "5677", "dryRun": true }
//   - since:  YYYY-MM-DD; defaults to 7 days ago
//   - shopId: restrict to one GO store; default = all active shops
//   - dryRun: default TRUE (no DB writes) for safety
// Auth: X-CF-Admin-Token header must equal env CF_ADMIN_TOKEN.
//   (Switch to JWT super-admin once _shared/auth.ts resolves roles — CF-12.)
//
// The actual sync logic lives in _shared/syncGonnaOrder.ts so the scheduled
// function (cf-scheduled-sync.ts) shares identical behaviour.

import type { Context } from '@netlify/functions'
import { ok, badRequest, methodNotAllowed, unauthorized, errorResponse } from './_shared/errors'
import { runSync } from './_shared/syncGonnaOrder'

type Body = {
  since?: string
  shopId?: string
  dryRun?: boolean
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') return methodNotAllowed(['POST'])

  const expected = process.env.CF_ADMIN_TOKEN
  const provided = req.headers.get('x-cf-admin-token') ?? req.headers.get('X-CF-Admin-Token')
  if (!expected) {
    return errorResponse(new Error('CF_ADMIN_TOKEN env var not set on the function'))
  }
  if (provided !== expected) {
    return unauthorized('Invalid or missing X-CF-Admin-Token')
  }

  let body: Body = {}
  try {
    if (req.headers.get('content-type')?.includes('application/json')) {
      body = (await req.json()) as Body
    }
  } catch {
    return badRequest('Body must be JSON')
  }

  const sinceDate = body.since ? new Date(body.since) : new Date(Date.now() - 7 * 24 * 3600 * 1000)
  if (Number.isNaN(sinceDate.getTime())) {
    return badRequest(`Invalid 'since': ${body.since}`)
  }
  const dryRun = body.dryRun !== false // default true for safety

  try {
    const summary = await runSync({ since: sinceDate, shopFilter: body.shopId, dryRun })
    return ok({ ok: true, summary })
  } catch (e) {
    return errorResponse(e)
  }
}
