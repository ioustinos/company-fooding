// Shared GonnaOrder → CF sync core.
//
// Used by BOTH:
//   - cf-sync-gonnaorder.ts      (HTTP endpoint, admin-token-gated, manual/bootstrap)
//   - cf-scheduled-sync.ts       (Netlify Scheduled Function, every 30 min)
//
// Behaviour:
//   1. List distinct GO shop IDs from agreement_shops where the agreement is active.
//   2. For each shop, listOrders(since) → dedupe by uuid+orderId.
//   3. For each order: look up the employee by lower(external_ref) = lower(voucherCode).
//      No match → write to audit_log as 'order_unmatched_voucher'; still upsert the
//      order with employee_id NULL so we don't drop data.
//   4. Resolve agreement_id + office_id from (employee.company_id, vendor).
//   5. Upsert orders ON CONFLICT (source, external_order_id) DO UPDATE.
//   6. Replace order_items for that order (DELETE + INSERT keyed on order_id).

import { supabaseAdmin } from './supabaseAdmin'
import { listOrders, type GoOrder } from './gonnaorder'
import { dedupGoOrders, parseOrder } from './parseGonnaOrder'

export type SyncSummary = {
  dryRun: boolean
  since: string
  shops: Array<{
    shopId: string
    fetched: number
    matched: number
    unmatched: number
    inserted: number
    updated: number
    error?: string
  }>
  totals: {
    fetched: number
    matched: number
    unmatched: number
    inserted: number
    updated: number
  }
}

export async function runSync(args: {
  since: Date
  shopFilter?: string
  dryRun: boolean
}): Promise<SyncSummary> {
  const sb = supabaseAdmin()
  const sinceIso = args.since.toISOString().slice(0, 10)

  // 1. Active GO shop IDs.
  type ShopRow = { gonnaorder_shop_id: string }
  const { data: shopRows, error: shopErr } = await sb
    .from('agreement_shops')
    .select('gonnaorder_shop_id, matchmaking_agreements!inner(status)')
    .eq('matchmaking_agreements.status', 'active')

  if (shopErr) throw new Error(`Failed to load agreement_shops: ${shopErr.message}`)
  const allShopIds = Array.from(
    new Set(((shopRows ?? []) as unknown as ShopRow[]).map((r) => r.gonnaorder_shop_id)),
  )
  const shopIds = args.shopFilter ? allShopIds.filter((s) => s === args.shopFilter) : allShopIds
  if (shopIds.length === 0) {
    return {
      dryRun: args.dryRun, since: sinceIso, shops: [],
      totals: { fetched: 0, matched: 0, unmatched: 0, inserted: 0, updated: 0 },
    }
  }

  // 2. Pre-load employees (voucher → employee) + active agreements (company×vendor → agreement).
  const { data: employees, error: empErr } = await sb
    .from('employees')
    .select('id, company_id, default_office_id, external_ref')
    .not('external_ref', 'is', null)

  if (empErr) throw new Error(`Failed to load employees: ${empErr.message}`)
  const empByVoucher = new Map<string, { id: string; company_id: string; default_office_id: string | null }>()
  for (const e of employees ?? []) {
    if (e.external_ref) empByVoucher.set(e.external_ref.toLowerCase(), {
      id: e.id, company_id: e.company_id, default_office_id: e.default_office_id,
    })
  }

  type AgRow = { id: string; company_id: string; vendor_id: string }
  const { data: agreements, error: agErr } = await sb
    .from('matchmaking_agreements')
    .select('id, company_id, vendor_id')
    .eq('status', 'active')

  if (agErr) throw new Error(`Failed to load matchmaking_agreements: ${agErr.message}`)
  const agByCompanyVendor = new Map<string, AgRow>()
  for (const a of (agreements ?? []) as AgRow[]) {
    agByCompanyVendor.set(`${a.company_id}::${a.vendor_id}`, a)
  }

  // Single active vendor for now (Wecook). Future: shop→vendor map.
  type VendorRow = { id: string }
  const { data: vendors, error: venErr } = await sb
    .from('vendors')
    .select('id')
    .eq('status', 'active')

  if (venErr) throw new Error(`Failed to load vendors: ${venErr.message}`)
  if (!vendors || vendors.length !== 1) {
    throw new Error(
      `Expected exactly 1 active vendor (got ${vendors?.length ?? 0}). ` +
      'Ambiguous vendor routing — needs a shop→vendor map in agreement_shops.',
    )
  }
  const vendorId = (vendors[0] as VendorRow).id

  // 3. Per-shop fetch + map + upsert.
  const summary: SyncSummary = {
    dryRun: args.dryRun, since: sinceIso, shops: [],
    totals: { fetched: 0, matched: 0, unmatched: 0, inserted: 0, updated: 0 },
  }

  for (const shopId of shopIds) {
    const shopOut = {
      shopId, fetched: 0, matched: 0, unmatched: 0, inserted: 0, updated: 0,
      error: undefined as string | undefined,
    }
    try {
      const raw = await listOrders({ storeId: shopId, since: args.since })
      const deduped = dedupGoOrders(raw)
      shopOut.fetched = deduped.length

      for (const go of deduped) {
        const result = await applyOneOrder({
          sb, go, shopId, vendorId, empByVoucher, agByCompanyVendor, dryRun: args.dryRun,
        })
        if (result.matched) shopOut.matched++; else shopOut.unmatched++
        if (result.action === 'inserted') shopOut.inserted++
        if (result.action === 'updated') shopOut.updated++
      }
    } catch (e) {
      shopOut.error = e instanceof Error ? e.message : String(e)
    }
    summary.shops.push(shopOut)
    summary.totals.fetched   += shopOut.fetched
    summary.totals.matched   += shopOut.matched
    summary.totals.unmatched += shopOut.unmatched
    summary.totals.inserted  += shopOut.inserted
    summary.totals.updated   += shopOut.updated
  }

  return summary
}

async function applyOneOrder(args: {
  sb: ReturnType<typeof supabaseAdmin>
  go: GoOrder
  shopId: string
  vendorId: string
  empByVoucher: Map<string, { id: string; company_id: string; default_office_id: string | null }>
  agByCompanyVendor: Map<string, { id: string; company_id: string; vendor_id: string }>
  dryRun: boolean
}): Promise<{ matched: boolean; action: 'inserted' | 'updated' | 'skipped' | 'unmatched_logged' }> {
  const { sb, go, shopId, vendorId, empByVoucher, agByCompanyVendor, dryRun } = args
  const { order, items } = parseOrder(go)

  const voucher = (order.voucher_code ?? '').toLowerCase()
  const employee = voucher ? empByVoucher.get(voucher) : null

  if (!employee && !dryRun) {
    await sb.from('audit_log').insert({
      action: 'order_unmatched_voucher',
      entity_table: 'orders',
      after: {
        shopId,
        orderId: order.external_order_id,
        uuid: order.external_uuid,
        voucher: order.voucher_code,
      },
    })
  }

  const agreement = employee
    ? agByCompanyVendor.get(`${employee.company_id}::${vendorId}`) ?? null
    : null

  const row = {
    source: order.source,
    external_order_id: order.external_order_id,
    external_uuid: order.external_uuid,
    order_token: order.order_token,
    voucher_code: order.voucher_code,
    employee_id:  employee?.id ?? null,
    company_id:   employee?.company_id ?? null,
    vendor_id:    vendorId,
    agreement_id: agreement?.id ?? null,
    office_id:    employee?.default_office_id ?? null,
    subtotal:        order.subtotal,
    benefit_applied: order.benefit_applied,
    topup_amount:    order.topup_amount,
    total:           order.total,
    delivery_date: order.delivery_date,
    time_from:     order.time_from,
    time_to:       order.time_to,
    status: order.status,
    placed_at: order.placed_at,
    raw_payload: order.raw_payload,
  }

  if (dryRun) {
    return { matched: !!employee, action: employee ? 'skipped' : 'unmatched_logged' }
  }

  const { data: upserted, error: upErr } = await sb
    .from('orders')
    .upsert(row, { onConflict: 'source,external_order_id' })
    .select('id')
    .single()
  if (upErr) throw new Error(`upsert order ${row.external_order_id}: ${upErr.message}`)

  const orderId = upserted!.id as string

  await sb.from('order_items').delete().eq('order_id', orderId)
  if (items.length) {
    const itemRows = items.map((it) => ({ ...it, order_id: orderId }))
    const { error: itemErr } = await sb.from('order_items').insert(itemRows)
    if (itemErr) throw new Error(`insert items for ${row.external_order_id}: ${itemErr.message}`)
  }

  return { matched: !!employee, action: 'inserted' }
}
