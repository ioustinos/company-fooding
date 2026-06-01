// cf-reconcile — month-end billing reconciliation for a company.
//
// PURPOSE (CF-96):
//   For the selected company in the given date range, answer:
//   "What do I bill, and is there anything I'm missing or that looks wrong
//    before I send the invoice?"
//
// SHAPE:
//   GET /api/cf-reconcile?companyId=<uuid>&from=YYYY-MM-DD&to=YYYY-MM-DD
//     defaults: from = today-7d, to = today
//   super_admin → any company; company_admin → own (companyId param ignored).
//
// CLASSIFICATION (per GO row):
//   matched                  — uuid in CF, amounts agree, voucher belongs to
//                              this company's employee → TO BILL
//   missing-known-voucher    — voucher belongs to this company's employee,
//                              not in CF → real ingestion gap → ATTENTION
//   missing-amount-mismatch  — in CF + voucher belongs to us, money differs
//                                                              → ATTENTION
//   no-voucher               — no voucher code used (full-price order) → INFO
//   orphan-voucher           — voucher code matches no CF employee
//                              (company-wide codes like QUEENSWAY5)    → INFO
//   cross-company            — voucher belongs to a different company that
//                              shares this store                       → INFO
//
//   missing-in-go            — CF has it, GO didn't return it           → ATTENTION
//                              (status/window quirk; should be near-zero)
//
// Per feedback memory `reconcile-show-orphans`: we NEVER filter orphan /
// no-voucher rows out — they're signal, not noise. The user uses them to
// either (a) spot anomalies or (b) back-fill a retro-benefit.

import type { Context } from '@netlify/functions'
import { ok, badRequest, forbidden, methodNotAllowed, errorResponse } from './_shared/errors'
import { getCaller } from './_shared/auth'
import { supabaseAdmin } from './_shared/supabaseAdmin'
import { listOrders, type GoOrder } from './_shared/gonnaorder'

type CfOrder = {
  external_order_id: string
  voucher_code: string | null
  subtotal: number
  benefit_applied: number
  status: string
  delivery_date: string | null
}

type VoucherOwner = {
  employee_id: string
  company_id: string
  display_name: string | null
}

type RowOut = {
  id: string
  voucher_code: string | null
  employee_name: string | null
  date: string | null
  subtotal_cents: number
  benefit_cents: number
  // present only for mismatches:
  subtotal_delta?: number
  benefit_delta?: number
  // present only for missing-in-go:
  cf_status?: string
}

const cents = (eur: unknown) => {
  const n = typeof eur === 'number' ? eur : Number(eur)
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

const lowerOrNull = (s: string | null | undefined) =>
  s && s.length > 0 ? s.toLowerCase() : null

// GO statuses we treat as "happened, invoiceable". Maps 1:1 to CF
// status='delivered' via parseGonnaOrder.STATUS_MAP.
const GO_FINAL_STATUSES = ['CLOSED', 'DELIVERED']

const ROW_CAP = 250

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'GET') return methodNotAllowed(['GET'])
  try {
    const caller = await getCaller(req)
    if (!caller || (caller.role !== 'super_admin' && caller.role !== 'company_admin')) {
      return forbidden('Admins only')
    }
    const url = new URL(req.url)
    const today = new Date(); const t = today.toISOString().slice(0, 10)
    const past = new Date(today); past.setDate(past.getDate() - 7); const p = past.toISOString().slice(0, 10)
    const from = url.searchParams.get('from') || p
    const to = url.searchParams.get('to') || t
    const companyId = caller.role === 'company_admin' ? caller.companyId : url.searchParams.get('companyId')
    if (!companyId) return badRequest('companyId required')

    const sb = supabaseAdmin()

    // --- GO store ids for this company ---
    const { data: ags } = await sb.from('matchmaking_agreements')
      .select('id, status, agreement_shops(gonnaorder_shop_id)')
      .eq('company_id', companyId).eq('status', 'active')
    const storeIds = ((ags ?? []) as Array<{ agreement_shops: { gonnaorder_shop_id: string }[] | null }>)
      .flatMap((a) => (a.agreement_shops ?? []).map((s) => s.gonnaorder_shop_id))
      .filter((v, i, arr) => v && arr.indexOf(v) === i)
    if (storeIds.length === 0) return badRequest('no GO shops for this company')

    // --- Voucher → owner map (every CF voucher code → company + employee) ---
    // Lowercased keys (GO matching is case-insensitive per memory).
    // We pull ALL assignments globally, not just current-company, so we can
    // tell "belongs to a different company sharing the store" vs "orphan."
    const { data: assignments } = await sb.from('benefit_assignments')
      .select('gonnaorder_voucher_code, employee:employees!inner(id, company_id, display_name)')
      .not('gonnaorder_voucher_code', 'is', null)
      .limit(50000)
    const voucherMap = new Map<string, VoucherOwner>()
    for (const a of (assignments ?? []) as unknown as Array<{
      gonnaorder_voucher_code: string | null
      employee: { id: string; company_id: string; display_name: string | null } | null
    }>) {
      const code = lowerOrNull(a.gonnaorder_voucher_code)
      if (!code || !a.employee) continue
      // First-write wins. (A code shouldn't be assigned to >1 employee, but if
      // history has dupes we keep the first.)
      if (!voucherMap.has(code)) {
        voucherMap.set(code, {
          employee_id: a.employee.id,
          company_id: a.employee.company_id,
          display_name: a.employee.display_name,
        })
      }
    }

    // --- CF side: orders for THIS company in window ---
    const { data: cfRows } = await sb.from('orders')
      .select('external_order_id, voucher_code, subtotal, benefit_applied, status, delivery_date')
      .eq('company_id', companyId)
      .gte('delivery_date', from)
      .lte('delivery_date', to)
      .limit(20000)
    const cfMap = new Map<string, CfOrder>()
    for (const r of (cfRows ?? []) as CfOrder[]) {
      if (r.external_order_id) cfMap.set(r.external_order_id, r)
    }

    // --- GO side: pull all final-state orders for each store since `from` ---
    const since = new Date(from + 'T00:00:00Z')
    const goAll: Array<{ raw: GoOrder; id: string; voucher: string | null; subtotal: number; benefit: number; date: string | null; status: string }> = []
    for (const sid of storeIds) {
      const orders = await listOrders({ storeId: sid, since, status: GO_FINAL_STATUSES, pageSize: 100 })
      for (const o of orders) {
        const id = String(o.uuid ?? o.orderId ?? '')
        if (!id) continue
        const dateRaw = typeof o.wishTime === 'string' ? o.wishTime.slice(0, 10) : null
        // Cap to the to-date here so GO-side and CF-side are comparing the
        // same window. `since` already enforces the lower bound.
        if (dateRaw && (dateRaw < from || dateRaw > to)) continue
        goAll.push({
          raw: o,
          id,
          voucher: (o.voucherCode ?? null) as string | null,
          subtotal: cents(o.totalNonDiscountedPrice),
          benefit: cents(o.voucherDiscount),
          date: dateRaw,
          status: String(o.status ?? '').toUpperCase(),
        })
      }
    }
    const goMap = new Map(goAll.map((o) => [o.id, o]))

    // --- Buckets ---
    const matched: RowOut[] = []
    const missingKnownVoucher: RowOut[] = []
    const missingAmountMismatch: RowOut[] = []
    const noVoucher: RowOut[] = []
    const orphanVoucher: RowOut[] = []
    const crossCompany: RowOut[] = []
    const missingInGo: RowOut[] = []

    // Running totals (cents)
    let toBillSubtotal = 0, toBillBenefit = 0
    let noVoucherSubtotal = 0
    let orphanSubtotal = 0, orphanBenefit = 0
    let crossSubtotal = 0, crossBenefit = 0
    let mismatchSubDelta = 0, mismatchBenDelta = 0
    let missingKnownSubtotal = 0, missingKnownBenefit = 0

    const orphanCodes = new Map<string, { count: number; subtotal_cents: number; benefit_cents: number; first_seen: string | null; last_seen: string | null }>()

    for (const g of goAll) {
      const voucherKey = lowerOrNull(g.voucher)
      const owner = voucherKey ? voucherMap.get(voucherKey) : undefined

      // Bucket 1: no voucher code at all
      if (!voucherKey) {
        if (noVoucher.length < ROW_CAP) {
          noVoucher.push({
            id: g.id, voucher_code: null, employee_name: null,
            date: g.date, subtotal_cents: g.subtotal, benefit_cents: g.benefit,
          })
        }
        noVoucherSubtotal += g.subtotal
        continue
      }

      // Bucket 2: orphan voucher (code not in any CF assignment)
      if (!owner) {
        if (orphanVoucher.length < ROW_CAP) {
          orphanVoucher.push({
            id: g.id, voucher_code: g.voucher, employee_name: null,
            date: g.date, subtotal_cents: g.subtotal, benefit_cents: g.benefit,
          })
        }
        orphanSubtotal += g.subtotal
        orphanBenefit += g.benefit
        const k = g.voucher as string
        const cur = orphanCodes.get(k) ?? { count: 0, subtotal_cents: 0, benefit_cents: 0, first_seen: null, last_seen: null }
        cur.count += 1
        cur.subtotal_cents += g.subtotal
        cur.benefit_cents += g.benefit
        if (g.date) {
          if (!cur.first_seen || g.date < cur.first_seen) cur.first_seen = g.date
          if (!cur.last_seen || g.date > cur.last_seen) cur.last_seen = g.date
        }
        orphanCodes.set(k, cur)
        continue
      }

      // Bucket 3: voucher belongs to a different company sharing the store
      if (owner.company_id !== companyId) {
        if (crossCompany.length < ROW_CAP) {
          crossCompany.push({
            id: g.id, voucher_code: g.voucher, employee_name: owner.display_name,
            date: g.date, subtotal_cents: g.subtotal, benefit_cents: g.benefit,
          })
        }
        crossSubtotal += g.subtotal
        crossBenefit += g.benefit
        continue
      }

      // From here on: voucher belongs to THIS company's employee.
      const cf = cfMap.get(g.id)

      // Bucket 4: missing in CF (ingestion gap)
      if (!cf) {
        if (missingKnownVoucher.length < ROW_CAP) {
          missingKnownVoucher.push({
            id: g.id, voucher_code: g.voucher, employee_name: owner.display_name,
            date: g.date, subtotal_cents: g.subtotal, benefit_cents: g.benefit,
          })
        }
        missingKnownSubtotal += g.subtotal
        missingKnownBenefit += g.benefit
        continue
      }

      // Bucket 5: matched on uuid; amount mismatch
      const subDelta = cf.subtotal - g.subtotal
      const benDelta = cf.benefit_applied - g.benefit
      if (subDelta !== 0 || benDelta !== 0) {
        if (missingAmountMismatch.length < ROW_CAP) {
          missingAmountMismatch.push({
            id: g.id, voucher_code: g.voucher, employee_name: owner.display_name,
            date: g.date, subtotal_cents: g.subtotal, benefit_cents: g.benefit,
            subtotal_delta: subDelta, benefit_delta: benDelta,
          })
        }
        mismatchSubDelta += subDelta
        mismatchBenDelta += benDelta
        continue
      }

      // Bucket 6 (the happy path): TO BILL
      if (matched.length < ROW_CAP) {
        matched.push({
          id: g.id, voucher_code: g.voucher, employee_name: owner.display_name,
          date: g.date, subtotal_cents: g.subtotal, benefit_cents: g.benefit,
        })
      }
      toBillSubtotal += g.subtotal
      toBillBenefit += g.benefit
    }

    // Bucket 7: in CF, not in GO (should be ~zero with the tightened query)
    let missingInGoSubtotal = 0, missingInGoBenefit = 0
    for (const [id, c] of cfMap) {
      if (goMap.has(id)) continue
      // Don't surface CF rows in cancelled state — they're expected to not
      // be returned by listOrders(['CLOSED','DELIVERED']).
      if ((c.status ?? '').toLowerCase() === 'cancelled') continue
      if (missingInGo.length < ROW_CAP) {
        missingInGo.push({
          id, voucher_code: c.voucher_code, employee_name: null,
          date: c.delivery_date, subtotal_cents: c.subtotal, benefit_cents: c.benefit_applied,
          cf_status: c.status,
        })
      }
      missingInGoSubtotal += c.subtotal
      missingInGoBenefit += c.benefit_applied
    }

    // Total counts (independent of ROW_CAP) — derived from the running totals.
    // For accurate counts we need a parallel counter; do it cleanly:
    const counts = {
      matched: 0, missingKnownVoucher: 0, missingAmountMismatch: 0,
      noVoucher: 0, orphanVoucher: 0, crossCompany: 0, missingInGo: 0,
    }
    // (Re-derive counts by re-walking goAll — cheap, single loop, no DB hits.)
    for (const g of goAll) {
      const voucherKey = lowerOrNull(g.voucher)
      const owner = voucherKey ? voucherMap.get(voucherKey) : undefined
      if (!voucherKey) { counts.noVoucher++; continue }
      if (!owner) { counts.orphanVoucher++; continue }
      if (owner.company_id !== companyId) { counts.crossCompany++; continue }
      const cf = cfMap.get(g.id)
      if (!cf) { counts.missingKnownVoucher++; continue }
      const subDelta = cf.subtotal - g.subtotal
      const benDelta = cf.benefit_applied - g.benefit
      if (subDelta !== 0 || benDelta !== 0) { counts.missingAmountMismatch++; continue }
      counts.matched++
    }
    for (const [id, c] of cfMap) {
      if (goMap.has(id)) continue
      if ((c.status ?? '').toLowerCase() === 'cancelled') continue
      counts.missingInGo++
    }

    return ok({
      period: { from, to },
      storeIds,
      // Headline numbers — what the 3 cards on the page show.
      headline: {
        toBill:        { count: counts.matched, subtotal_cents: toBillSubtotal, benefit_cents: toBillBenefit },
        needsAttention: {
          count: counts.missingKnownVoucher + counts.missingAmountMismatch + counts.missingInGo,
          missingKnownVoucher_count: counts.missingKnownVoucher,
          missingKnownVoucher_subtotal_cents: missingKnownSubtotal,
          missingKnownVoucher_benefit_cents: missingKnownBenefit,
          mismatch_count: counts.missingAmountMismatch,
          mismatch_subtotal_delta_cents: mismatchSubDelta,
          mismatch_benefit_delta_cents: mismatchBenDelta,
          missingInGo_count: counts.missingInGo,
          missingInGo_subtotal_cents: missingInGoSubtotal,
          missingInGo_benefit_cents: missingInGoBenefit,
        },
        forInfo: {
          count: counts.noVoucher + counts.orphanVoucher + counts.crossCompany,
          noVoucher_count: counts.noVoucher,
          noVoucher_subtotal_cents: noVoucherSubtotal,
          orphan_count: counts.orphanVoucher,
          orphan_subtotal_cents: orphanSubtotal,
          orphan_benefit_cents: orphanBenefit,
          crossCompany_count: counts.crossCompany,
          crossCompany_subtotal_cents: crossSubtotal,
          crossCompany_benefit_cents: crossBenefit,
        },
      },
      // Per-bucket row lists (capped at ROW_CAP each for response size).
      buckets: {
        matched,
        missingKnownVoucher,
        missingAmountMismatch,
        noVoucher,
        orphanVoucher,
        crossCompany,
        missingInGo,
      },
      // Grouped orphan summary — codes the user may want to back-fill with a
      // retro-benefit. Sorted by occurrence count desc.
      orphanCodeSummary: Array.from(orphanCodes.entries())
        .map(([code, agg]) => ({ code, ...agg }))
        .sort((a, b) => b.count - a.count),
    })
  } catch (e) {
    return errorResponse(e)
  }
}
