// cf-topups — create / refresh GO customer vouchers from active CF benefit
// assignments. Manual trigger + safe to invoke from a schedule.
//
//   POST /api/cf-topups   header: x-cf-admin-token: <CF_ADMIN_TOKEN>
//   body (all optional):
//     { dryRun?: bool, assignmentId?: uuid, employeeId?: uuid, benefitId?: uuid }
//
// Behavior:
//   For each active benefit_assignment that matches the filter:
//     1. Look up the company's first active GO shop (matchmaking_agreements
//        + agreement_shops).
//     2. Look up the existing voucher in that store by code
//        (assignment.gonnaorder_voucher_code).
//     3. CREATE if missing; PUT if exists — refresh startDate/endDate.
//        Discount value is currently fixed to a sensible default per store
//        (PERCENTILE 5% matches Queensway's existing n8n setup). When the
//        product moves to true balance-style vouchers, switch discountType
//        ABSOLUTE here.
//     4. Log result to benefit_topups (unique on assignment_id + scheduled_for).
//
// Dry-run (CF_TOPUPS_DRY_RUN=true OR body.dryRun=true): logs the *intended*
// GO call and DB write but actually does neither. Always default-on until
// Ioustinos flips for production.

import type { Context } from '@netlify/functions'
import { ok, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { supabaseAdmin } from './_shared/supabaseAdmin'
import { createVoucher, updateVoucher, findVoucherByCode } from './_shared/gonnaorder'

type Assign = {
  id: string
  employee_id: string
  benefit_id: string
  gonnaorder_voucher_code: string | null
  benefits: { id: string; company_id: string; name_el: string; name_en: string; status: string } | null
  employees: { id: string; display_name: string; external_ref: string | null; status: string } | null
}

type Body = { dryRun?: boolean; assignmentId?: string; employeeId?: string; benefitId?: string }

async function shopIdForCompany(sb: ReturnType<typeof supabaseAdmin>, companyId: string): Promise<string | null> {
  const { data } = await sb.from('matchmaking_agreements')
    .select('id, status, agreement_shops(gonnaorder_shop_id)')
    .eq('company_id', companyId).eq('status', 'active').limit(5)
  for (const a of (data ?? []) as Array<{ agreement_shops: { gonnaorder_shop_id: string }[] | null }>) {
    const id = a.agreement_shops?.[0]?.gonnaorder_shop_id
    if (id) return id
  }
  return null
}

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') return methodNotAllowed(['POST'])
  const expected = process.env.CF_ADMIN_TOKEN
  const got = req.headers.get('x-cf-admin-token') ?? req.headers.get('X-CF-Admin-Token')
  if (!expected || got !== expected) return forbidden('admin token required')

  const b = (await req.json().catch(() => ({}))) as Body
  const envDry = String(process.env.CF_TOPUPS_DRY_RUN ?? 'true').toLowerCase() !== 'false'
  const dryRun = b.dryRun ?? envDry

  const sb = supabaseAdmin()
  let q = sb.from('benefit_assignments')
    .select('id, employee_id, benefit_id, gonnaorder_voucher_code, ' +
            'benefits(id, company_id, name_el, name_en, status), ' +
            'employees(id, display_name, external_ref, status)')
    .is('unassigned_at', null)
  if (b.assignmentId) q = q.eq('id', b.assignmentId)
  if (b.employeeId)   q = q.eq('employee_id', b.employeeId)
  if (b.benefitId)    q = q.eq('benefit_id', b.benefitId)
  const { data, error } = await q
  if (error) return errorResponse(error)

  const today = new Date().toISOString().slice(0, 10)
  const results: Array<Record<string, unknown>> = []

  for (const a of (data ?? []) as unknown as Assign[]) {
    const benefit = a.benefits, emp = a.employees
    const result: Record<string, unknown> = {
      assignment_id: a.id,
      employee: emp?.display_name ?? null,
      benefit: benefit?.name_en ?? null,
    }
    if (!benefit || benefit.status !== 'active') { result.skipped = 'benefit not active'; results.push(result); continue }
    if (!emp || emp.status !== 'active')         { result.skipped = 'employee not active'; results.push(result); continue }
    const code = (a.gonnaorder_voucher_code || emp.external_ref || '').trim()
    if (!code) { result.skipped = 'no voucher code'; results.push(result); continue }

    const storeId = await shopIdForCompany(sb, benefit.company_id)
    if (!storeId) { result.skipped = 'no GO shop for company'; results.push(result); continue }
    result.store_id = storeId; result.voucher_code = code

    try {
      const existing = await findVoucherByCode(storeId, code)
      result.existing = Boolean(existing)

      // For now mirror the n8n model: 5% PERCENTILE MULTI_USE. When CF moves to
      // fixed-amount balance vouchers, switch to ABSOLUTE + initialValue from
      // benefit_rules.topup_amount.
      const now = new Date()
      const sixMo = new Date(now); sixMo.setMonth(sixMo.getMonth() + 6)

      if (dryRun) {
        result.action = existing ? 'WOULD UPDATE' : 'WOULD CREATE'
        result.payload = existing
          ? { id: existing.id, code, startDate: now.toISOString(), endDate: sixMo.toISOString(), isActive: true }
          : { code, discount: 5, discountType: 'PERCENTILE', type: 'MULTI_USE', startDate: now.toISOString(), endDate: sixMo.toISOString() }
      } else if (existing) {
        const updated = await updateVoucher({
          storeId, voucherId: String(existing.id ?? ''),
          fields: {
            code, startDate: now.toISOString(), endDate: sixMo.toISOString(),
            isActive: true, type: existing.type, discountType: existing.discountType,
            discount: existing.discount, initialValue: existing.initialValue ?? null,
          },
        })
        result.action = 'UPDATED'
        result.voucher_id = updated.id
      } else {
        const created = await createVoucher({
          storeId, code, discount: 5, discountType: 'PERCENTILE', type: 'MULTI_USE',
          startDate: now, endDate: sixMo, orderMinAmount: 0,
        })
        result.action = 'CREATED'
        result.voucher_id = created.id
      }

      // Record the attempt (idempotent via unique (assignment_id, scheduled_for))
      if (!dryRun) {
        await sb.from('benefit_topups').upsert({
          assignment_id: a.id,
          benefit_id: a.benefit_id,
          employee_id: a.employee_id,
          scheduled_for: today,
          status: 'applied',
          amount: 0,                              // 0 = "voucher refreshed"; switch to topup_amount when on balance-style vouchers
          gonnaorder_voucher_code: code,
          applied_at: new Date().toISOString(),
        }, { onConflict: 'assignment_id,scheduled_for' })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      result.action = 'ERROR'
      result.error = msg
      if (!dryRun) {
        await sb.from('benefit_topups').upsert({
          assignment_id: a.id,
          benefit_id: a.benefit_id,
          employee_id: a.employee_id,
          scheduled_for: today,
          status: 'failed',
          amount: 0,
          gonnaorder_voucher_code: code,
          applied_at: new Date().toISOString(),
          error_detail: msg,
        }, { onConflict: 'assignment_id,scheduled_for' })
      }
    }
    results.push(result)
  }

  return ok({ dryRun, total: results.length, results })
}
