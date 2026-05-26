// Shared top-up logic used by the manual cf-topups endpoint and the scheduled
// cf-topups-cron. Pure function-of-arguments + Supabase: doesn't read HTTP
// headers or env (other than CF_TOPUPS_DRY_RUN at decision time).

import { supabaseAdmin } from './supabaseAdmin'
import { createVoucher, updateVoucher, findVoucherByCode } from './gonnaorder'

type Rule = {
  topup_cadence: string; topup_amount: number
  voucher_discount_type: 'absolute' | 'percentile'
  voucher_discount_pct: number | null
}
type Assign = {
  id: string; employee_id: string; benefit_id: string
  gonnaorder_voucher_code: string | null
  benefits: {
    id: string; company_id: string; name_el: string; name_en: string; status: string
    benefit_rules: Rule[] | Rule | null
  } | null
  employees: { id: string; display_name: string; external_ref: string | null; status: string } | null
}

export type RunTopupsOpts = {
  dryRun?: boolean
  assignmentId?: string
  employeeId?: string
  benefitId?: string
}
export type TopupResult = {
  dryRun: boolean
  total: number
  results: Array<Record<string, unknown>>
}

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

export async function runTopups(opts: RunTopupsOpts): Promise<TopupResult> {
  const envDry = String(process.env.CF_TOPUPS_DRY_RUN ?? 'true').toLowerCase() !== 'false'
  const dryRun = opts.dryRun ?? envDry
  const sb = supabaseAdmin()

  let q = sb.from('benefit_assignments')
    .select('id, employee_id, benefit_id, gonnaorder_voucher_code, ' +
            'benefits(id, company_id, name_el, name_en, status, ' +
            'benefit_rules(topup_cadence, topup_amount, voucher_discount_type, voucher_discount_pct)), ' +
            'employees(id, display_name, external_ref, status)')
    .is('unassigned_at', null)
  if (opts.assignmentId) q = q.eq('id', opts.assignmentId)
  if (opts.employeeId)   q = q.eq('employee_id', opts.employeeId)
  if (opts.benefitId)    q = q.eq('benefit_id', opts.benefitId)
  const { data, error } = await q
  if (error) throw error

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

    const rule = Array.isArray(benefit.benefit_rules) ? benefit.benefit_rules[0] : benefit.benefit_rules
    const voucherType: 'absolute' | 'percentile' = (rule?.voucher_discount_type as 'absolute' | 'percentile') || 'absolute'
    const pct = rule?.voucher_discount_pct ?? null
    const amountCents = rule?.topup_amount ?? 0
    result.voucher_style = voucherType
    if (voucherType === 'absolute') result.amount_eur = amountCents / 100
    if (voucherType === 'percentile') result.discount_pct = pct ?? null

    try {
      const existing = await findVoucherByCode(storeId, code)
      result.existing = Boolean(existing)
      const now = new Date()
      const sixMo = new Date(now); sixMo.setMonth(sixMo.getMonth() + 6)

      const createPayload = voucherType === 'percentile'
        ? { discount: pct ?? 5, discountType: 'PERCENTILE' as const, initialValue: null }
        : { discount: amountCents / 100, discountType: 'MONETARY' as const, initialValue: amountCents / 100 }

      if (dryRun) {
        result.action = existing ? 'WOULD UPDATE' : 'WOULD CREATE'
        result.payload = existing
          ? { id: existing.id, code, startDate: now.toISOString(), endDate: sixMo.toISOString(), isActive: true,
              discount: existing.discount, discountType: existing.discountType }
          : { code, type: 'MULTI_USE', startDate: now.toISOString(), endDate: sixMo.toISOString(),
              orderMinAmount: 0, ...createPayload }
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
          storeId, code, type: 'MULTI_USE',
          startDate: now, endDate: sixMo, orderMinAmount: 0,
          discount: createPayload.discount,
          discountType: createPayload.discountType,
          initialValue: createPayload.initialValue,
        })
        result.action = 'CREATED'
        result.voucher_id = created.id
      }

      if (!dryRun) {
        await sb.from('benefit_topups').upsert({
          assignment_id: a.id,
          benefit_id: a.benefit_id,
          employee_id: a.employee_id,
          scheduled_for: today,
          status: 'applied',
          amount: 0,
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

  return { dryRun, total: results.length, results }
}
