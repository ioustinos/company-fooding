// Lightweight activity logger — fire-and-forget. Don't await this if the
// caller's response shouldn't depend on the log write succeeding (it almost
// never should).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { ResolvedUser } from './auth'

export type ActivityKind =
  | 'benefit.created' | 'benefit.updated' | 'benefit.archived' | 'benefit.reactivated'
  | 'benefit.assigned_all' | 'benefit.assigned_employees' | 'benefit.unassigned'
  | 'employee.created' | 'employee.updated' | 'employee.deactivated' | 'employee.activated' | 'employee.bulk_imported'
  | 'group.created' | 'group.updated' | 'group.archived'
  | 'company.profile_updated'

export async function logActivity(
  sb: SupabaseClient,
  caller: ResolvedUser | null,
  companyId: string | null,
  kind: ActivityKind,
  fields: {
    target_type?: string
    target_id?: string | null
    summary_el?: string
    summary_en?: string
    payload?: Record<string, unknown>
  } = {},
): Promise<void> {
  try {
    await sb.from('activity_events').insert({
      company_id: companyId,
      actor_user_id: caller?.user.id ?? null,
      actor_email: caller?.user.email ?? null,
      kind,
      target_type: fields.target_type ?? null,
      target_id: fields.target_id ?? null,
      summary_el: fields.summary_el ?? null,
      summary_en: fields.summary_en ?? null,
      payload: fields.payload ?? null,
    })
  } catch {
    // never throw — activity log is best-effort
  }
}
