// cf-topups-cron — scheduled wrapper around runTopups.
//
// Runs daily at 06:00 Athens (= 04:00 UTC in winter, 03:00 UTC in summer; we
// stick with 04:00 UTC year-round — close enough for a daily refresh).
//
// Respects CF_TOPUPS_DRY_RUN env var. Defaults to dry-run (true). To go live,
// set CF_TOPUPS_DRY_RUN=false in Netlify.

import type { Config } from '@netlify/functions'
import { runTopups } from './_shared/topups'

export default async () => {
  try {
    const result = await runTopups({})
    console.log('[cf-topups-cron]', JSON.stringify({
      dryRun: result.dryRun, total: result.total,
      applied: result.results.filter((r) => r.action === 'UPDATED' || r.action === 'CREATED').length,
      errors:  result.results.filter((r) => r.action === 'ERROR').length,
      skipped: result.results.filter((r) => r.skipped).length,
    }))
    return new Response('ok', { status: 200 })
  } catch (e) {
    console.error('[cf-topups-cron] failed', e)
    return new Response('error', { status: 500 })
  }
}

export const config: Config = {
  schedule: '0 4 * * *',     // daily at 04:00 UTC (≈ 06:00–07:00 Athens)
}
