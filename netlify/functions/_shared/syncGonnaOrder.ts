// Shared GonnaOrder → CF sync core.
//
// Used by BOTH:
//   - cf-sync-gonnaorder.ts      (HTTP endpoint, admin-token-gated, manual/bootstrap)
//   - cf-scheduled-sync.ts       (Netlify Scheduled Function, every 30 min)
//
// Behaviour:
//   1. List distinct GO shop IDs from agreement_shops where the agreement is active.
//   2. For each shop, listOrders(since) → dedupe by uuid+orderId.
//   3. For each order, resolve the employee in this order:
//        a. lower(voucherCode) = lower(employees.external_ref)
//        b. lower(voucherCode) = lower(benefit_assignments.gonnaorder_voucher_code)
//           (covers legacy voucher codes kept on older assignments, e.g. HarborLab's
//           pre-member-code vouchers)
//        c. lower(customerEmail) = lower(employees.email)
//           (GO member-code / loyalty orders carry NO code on the order at all —
//           confirmed on store 7085, 2026-10-02 — only the customer's email)
//      A code or email that maps to more than one employee is treated as no match.
//      No match → write to audit_log as 'order_unmatched_voucher'; still upsert the
//      order with employee_id NULL so we don't drop data.
//   4. Resolve agreement_id + office_id from (employee.company_id, vendor).
//   5. Upsert orders ON CONFLICT (source, external_order_id) DO UPDATE — in chunks of 200.
//   6. Replace order_items only for orders whose payload carried items.
//   Shops are processed in parallel.

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

  // 2. Pre-load employees (code/email → employee) + active agreements (company×vendor → agreement).
  const { data: employees, error: empErr } = await sb
    .from('employees')
    .select('id, company_id, default_office_id, external_ref, email')

  if (empErr) throw new Error(`Failed to load employees: ${empErr.message}`)

  const { data: assignCodes, error: asgErr } = await sb
    .from('benefit_assignments')
    .select('employee_id, gonnaorder_voucher_code')
    .not('gonnaorder_voucher_code', 'is', null)
    .not('employee_id', 'is', null)

  if (asgErr) throw new Error(`Failed to load benefit_assignments: ${asgErr.message}`)

  const empLookup = buildEmployeeLookup(
    (employees ?? []) as EmpRow[],
    (assignCodes ?? []) as Array<{ employee_id: string; gonnaorder_voucher_code: string }>,
  )

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

  // Shops run in parallel and each shop writes in batches. The old loop did
  // 2 sequential DB round-trips per order across all shops in series (~1,200
  // calls per run), and the scheduled run was being cut off inside the first
  // shop (5677) — later shops (5909, 7085) stopped syncing after 2026-10-01
  // 22:15 UTC.
  const results = await Promise.all(shopIds.map(async (shopId) => {
    const shopOut = {
      shopId, fetched: 0, matched: 0, unmatched: 0, inserted: 0, updated: 0,
      error: undefined as string | undefined,
    }
    try {
      const raw = await listOrders({ storeId: shopId, since: args.since })
      const deduped = dedupGoOrders(raw)
      shopOut.fetched = deduped.length
      const r = await applyShopOrders({
        sb, orders: deduped, shopId, vendorId, empLookup, agByCompanyVendor, dryRun: args.dryRun,
      })
      shopOut.matched = r.matched
      shopOut.unmatched = r.unmatched
      shopOut.inserted = r.written
    } catch (e) {
      shopOut.error = e instanceof Error ? e.message : String(e)
    }
    return shopOut
  }))

  for (const shopOut of results) {
    summary.shops.push(shopOut)
    summary.totals.fetched   += shopOut.fetched
    summary.totals.matched   += shopOut.matched
    summary.totals.unmatched += shopOut.unmatched
    summary.totals.inserted  += shopOut.inserted
    summary.totals.updated   += shopOut.updated
  }

  return summary
}

const UPSERT_CHUNK = 200

async function applyShopOrders(args: {
  sb: ReturnType<typeof supabaseAdmin>
  orders: GoOrder[]
  shopId: string
  vendorId: string
  empLookup: EmployeeLookup
  agByCompanyVendor: Map<string, { id: string; company_id: string; vendor_id: string }>
  dryRun: boolean
}): Promise<{ matched: number; unmatched: number; written: number }> {
  const { sb, orders, shopId, vendorId, empLookup, agByCompanyVendor, dryRun } = args

  const rows: Array<Record<string, unknown>> = []
  const itemsByExtId = new Map<string, ReturnType<typeof parseOrder>['items']>()
  const audits: Array<Record<string, unknown>> = []
  let matched = 0, unmatched = 0

  for (const go of orders) {
    const { order, items } = parseOrder(go)
    const email = (go as { customerEmail?: unknown }).customerEmail ?? null
    const employee = empLookup.resolve(order.voucher_code, email)
    if (employee) matched++
    else {
      unmatched++
      audits.push({
        action: 'order_unmatched_voucher',
        entity_table: 'orders',
        after: { shopId, orderId: order.external_order_id, uuid: order.external_uuid, voucher: order.voucher_code, email },
      })
    }
    const agreement = employee ? agByCompanyVendor.get(`${employee.company_id}::${vendorId}`) ?? null : null

    rows.push({
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
    })
    if (items.length) itemsByExtId.set(order.external_order_id, items)
  }

  if (dryRun) return { matched, unmatched, written: 0 }

  // A chunk must not contain the same key twice (Postgres rejects
  // ON CONFLICT DO UPDATE touching a row twice). Last one wins.
  const uniqueRows = [...new Map(rows.map((r) => [String(r.external_order_id), r])).values()]

  // Orders: chunked upserts.
  const idByExtId = new Map<string, string>()
  for (let i = 0; i < uniqueRows.length; i += UPSERT_CHUNK) {
    const chunk = uniqueRows.slice(i, i + UPSERT_CHUNK)
    const { data, error } = await sb
      .from('orders')
      .upsert(chunk, { onConflict: 'source,external_order_id' })
      .select('id, external_order_id')
    if (error) throw new Error(`upsert orders (shop ${shopId}, rows ${i}-${i + chunk.length}): ${error.message}`)
    for (const r of (data ?? []) as Array<{ id: string; external_order_id: string }>) idByExtId.set(r.external_order_id, r.id)
  }

  // Items: only for orders whose payload carried items (the /orders/search
  // listing usually carries none — then existing items are left untouched).
  if (itemsByExtId.size) {
    const orderIds = [...itemsByExtId.keys()].map((k) => idByExtId.get(k)).filter((x): x is string => !!x)
    for (let i = 0; i < orderIds.length; i += UPSERT_CHUNK) {
      const { error } = await sb.from('order_items').delete().in('order_id', orderIds.slice(i, i + UPSERT_CHUNK))
      if (error) throw new Error(`delete items (shop ${shopId}): ${error.message}`)
    }
    const itemRows = [...itemsByExtId.entries()].flatMap(([ext, items]) => {
      const orderId = idByExtId.get(ext)
      return orderId ? items.map((it) => ({ ...it, order_id: orderId })) : []
    })
    for (let i = 0; i < itemRows.length; i += UPSERT_CHUNK) {
      const { error } = await sb.from('order_items').insert(itemRows.slice(i, i + UPSERT_CHUNK))
      if (error) throw new Error(`insert items (shop ${shopId}): ${error.message}`)
    }
  }

  // Unmatched audit rows: one batched insert (best-effort).
  for (let i = 0; i < audits.length; i += UPSERT_CHUNK) {
    await sb.from('audit_log').insert(audits.slice(i, i + UPSERT_CHUNK))
  }

  return { matched, unmatched, written: idByExtId.size }
}

// ── employee lookup ─────────────────────────────────────────────────────────

type EmpRow = {
  id: string
  company_id: string
  default_office_id: string | null
  external_ref: string | null
  email: string | null
}
type EmpHit = { id: string; company_id: string; default_office_id: string | null }
export type EmployeeLookup = { resolve: (code: unknown, email: unknown) => EmpHit | null }

const AMBIGUOUS = 'ambiguous' as const

export function buildEmployeeLookup(
  employees: EmpRow[],
  assignCodes: Array<{ employee_id: string; gonnaorder_voucher_code: string }>,
): EmployeeLookup {
  const byId = new Map<string, EmpHit>()
  for (const e of employees) byId.set(e.id, { id: e.id, company_id: e.company_id, default_office_id: e.default_office_id })

  // key → employee id, or AMBIGUOUS when two different employees claim it.
  const add = (m: Map<string, string>, raw: string | null | undefined, empId: string) => {
    const k = (raw ?? '').trim().toLowerCase()
    if (!k) return
    const prev = m.get(k)
    if (prev === undefined) m.set(k, empId)
    else if (prev !== empId) m.set(k, AMBIGUOUS)
  }

  const byCode = new Map<string, string>()
  for (const e of employees) add(byCode, e.external_ref, e.id)
  for (const a of assignCodes) if (byId.has(a.employee_id)) add(byCode, a.gonnaorder_voucher_code, a.employee_id)

  const byEmail = new Map<string, string>()
  for (const e of employees) add(byEmail, e.email, e.id)

  const pick = (m: Map<string, string>, raw: unknown): EmpHit | null => {
    const k = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
    if (!k) return null
    const id = m.get(k)
    if (!id || id === AMBIGUOUS) return null
    return byId.get(id) ?? null
  }

  return {
    resolve: (code, email) => pick(byCode, code) ?? pick(byEmail, email),
  }
}
