// cf-sync-trigger-background — UI-callable manual sync as a Netlify BACKGROUND
// function (filename suffix `-background` triggers Netlify's 15-min execution
// limit instead of the 26s sync ceiling). Returns 202 immediately; the actual
// sync runs async. The Reconcile page treats 202 as success and re-fetches
// after a short delay.
//
// Renamed 2026-06-01 after the multi-store 17-day backfill timed out at 504.
//
// POST /api/cf-sync-trigger-background
//   body: { since?: 'YYYY-MM-DD', shopId?: string, dryRun?: boolean }
//   defaults: since = today - 30d, dryRun = false
//   auth: Authorization: Bearer <user JWT>  (super_admin role required)

import type { Context } from '@netlify/functions'
import { getCaller } from './_shared/auth'
import { runSync } from './_shared/syncGonnaOrder'

export default async (req: Request, _ctx: Context) => {
  // Background functions return 202 immediately. Validation errors still get
  // surfaced through the JSON body so the client can show them.
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST required' }), { status: 405, headers: { 'content-type': 'application/json' } })
  }

  const caller = await getCaller(req)
  if (!caller || caller.role !== 'super_admin') {
    return new Response(JSON.stringify({ error: 'super_admin only' }), { status: 403, headers: { 'content-type': 'application/json' } })
  }

  const b = (await req.json().catch(() => ({}))) as { since?: string; shopId?: string; dryRun?: boolean }
  const sinceDate = b.since ? new Date(b.since) : new Date(Date.now() - 30 * 24 * 3600 * 1000)
  if (Number.isNaN(sinceDate.getTime())) {
    return new Response(JSON.stringify({ error: `Invalid 'since': ${b.since}` }), { status: 400, headers: { 'content-type': 'application/json' } })
  }

  // Fire-and-forget. We DO await it inside the function — Netlify's background
  // runtime keeps the function alive until this resolves (up to 15 min). The
  // caller already has its 202 from Netlify's background-function shim.
  try {
    const summary = await runSync({
      since: sinceDate,
      shopFilter: b.shopId,
      dryRun: b.dryRun === true,
    })
    console.log('[cf-sync-trigger-background] done', JSON.stringify(summary.totals ?? summary))
  } catch (e) {
    console.error('[cf-sync-trigger-background] failed', e instanceof Error ? e.message : String(e))
  }

  // Background functions ignore the response body; Netlify always returns 202.
  return new Response('ok', { status: 202 })
}
