// cf-scheduled-sync — Netlify Scheduled Function.
//
// Runs every 30 minutes (UTC) to keep the CF orders mirror relatively live so
// reports reflect recent GonnaOrder activity without manual triggering.
//
// No HTTP auth: scheduled functions are invoked internally by Netlify's
// scheduler, not via the public URL, so there's no caller to authenticate.
// It calls the SAME runSync() core as the manual cf-sync-gonnaorder endpoint.
//
// Lookback window: 3 days. Orders for a given day's lunch are placed that
// morning, but a 3-day window cheaply covers late-arriving or amended orders.
// runSync is idempotent (upsert ON CONFLICT), so the overlap is harmless.

import type { Config } from '@netlify/functions'
import { runSync } from './_shared/syncGonnaOrder'

const LOOKBACK_DAYS = 3

export default async () => {
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 3600 * 1000)
  try {
    const summary = await runSync({ since, dryRun: false })
    console.log('[cf-scheduled-sync] done', JSON.stringify(summary.totals), 'since', summary.since)
    // Scheduled functions don't serve a response to a client, but returning a
    // 200 keeps the run marked successful in Netlify's function logs.
    return new Response(JSON.stringify({ ok: true, summary }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e)
    console.error('[cf-scheduled-sync] FAILED', message)
    return new Response(JSON.stringify({ ok: false, error: message }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  }
}

// Every 30 minutes. Netlify cron is UTC; */30 means :00 and :30 of every hour.
export const config: Config = {
  schedule: '*/30 * * * *',
}
