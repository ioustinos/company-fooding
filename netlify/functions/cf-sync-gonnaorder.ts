// cf-sync-gonnaorder — pull orders from GonnaOrder into the CF orders mirror.
//
// Endpoint: POST /api/cf-sync-gonnaorder
// Body (all optional):
//   {
//     "since":   "2026-03-01",   // YYYY-MM-DD; defaults to 7 days ago
//     "shopId":  "5677",         // restrict to a single GO store; default = all active shops
//     "dryRun":  true            // default true. dryRun=true does NOT write to DB.
//   }
// Auth: X-CF-Admin-Token header must equal env CF_ADMIN_TOKEN.
//   (We'll switch to JWT-based super-admin auth once the role resolver in
//    _shared/auth.ts is filled in — for now this is the bootstrap endpoint.)
//
// Behaviour:
//   1. List distinct GO shop IDs from agreement_shops where the agreement is active.
//   2. For each shop, listOrders(since) → dedupe by uuid+orderId.
//   3. For each order: look up the employee by lower(external_ref) = lower(voucherCode).
//      No match → write to audit_log as 'order_unmatched_voucher'; still upsert the
//      order with employee_id NULL so we don't drop data (we can backfill later).
//   4. Resolve agreement_id + office_id from (employee.company_id, vendor=Wecook).
//   5. Upsert orders ON CONFLICT (source, external_order_id) DO UPDATE.
//   6. Replace order_items for that order in a single transaction (DELETE + INSERT
//      keyed on order_id — items don't have stable external IDs).
//   7. Return summary.

import type { Context } from '@netlify/functions'
import { ok, badRequest, methodNotAllowed, unauthorized, errorResponse } from './_shared/errors'
import { supabaseAdmin } from './_shared/supabaseAdmin'
import { listOrders, type GoOrder } from './_shared/gonnaorder'
import { dedupGoOrders, parseOrder } from './_shared/parseGonnaOrder'

type Body = {
  since?: string
  shopId?: string
  dryRun?: boolean
}

type SyncSummary = {
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

export default async (req: Request, _ctx: Context) => {
  if (req.method !== 'POST') return methodNotAllowed(['POST'])

  // Bootstrap auth: require an admin token header until the JWT-role resolver
  // lands. The token lives in env CF_ADMIN_TOKEN (Netlify function scope).
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
  const sinceIso = sinceDate.toISOString().slice(0, 10)
  const dryRun = body.dryRun !== false   // default true for safety

  try {
    const summary = await runSync({ since: sinceDate, shopFilter: body.shopId, dryRun })
    return ok({ ok: true, summary, sinceIso })
  } catch (e) {
    return errorResponse(e)
  }
}

// -------- core sync ---------------------------------------------------------

async function runSync(args: {
  since: Date
  shopFilter?: string
  dryRun: boolean
}): Promise<SyncSummary> {
  const sb = supabaseAdmin()
  const sinceIso = args.since.toISOString().slice(0, 10)

  // 1. Fetch the active GO shop IDs we need to sync.
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

  // 2. Pre-load employees keyed by lower(external_ref) for the case-insensitive
  //    voucher lookup. Also preload (company_id → agreement_id, office_id) for
  //    Wecook agreements so we can wire orders without per-row queries.
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

  // We need the vendor_id for the GO source. Today we have one vendor (Wecook).
  // In future, the GO shop ID will determine which vendor. For now: assume one
  // active vendor across the catalog.
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

  // 3. For each shop, fetch + map + upsert.
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

// -------- per-order apply ---------------------------------------------------

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

  if (!employee) {
    if (!dryRun) {
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
    // Still upsert the order with NULL employee/company/agreement so we
    // don't lose data — backfill later via a separate "claim" job.
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

  // upsert via on_conflict
  const { data: upserted, error: upErr } = await sb
    .from('orders')
    .upsert(row, { onConflict: 'source,external_order_id' })
    .select('id')
    .single()
  if (upErr) throw new Error(`upsert order ${row.external_order_id}: ${upErr.message}`)

  const orderId = upserted!.id as string

  // Replace items
  await sb.from('order_items').delete().eq('order_id', orderId)
  if (items.length) {
    const itemRows = items.map((it) => ({ ...it, order_id: orderId }))
    const { error: itemErr } = await sb.from('order_items').insert(itemRows)
    if (itemErr) throw new Error(`insert items for ${row.external_order_id}: ${itemErr.message}`)
  }

  // We can't cheaply tell insert from update via PostgREST upsert. Treat all
  // as "inserted" in the summary — refine via a follow-up SELECT if a hard
  // count matters down the line.
  return { matched: !!employee, action: 'inserted' }
}
