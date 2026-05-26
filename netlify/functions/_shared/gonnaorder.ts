// GonnaOrder API client.
//
// Replaces the previous stub. Calls are derived from the working Base44
// sync component (see memory: reference_gonnaorder_api). GO uses a
// login-then-JWT auth model — no static API key. We cache the JWT in
// module scope; any 401 triggers a re-auth + single retry.
//
// Env:
//   GONNAORDER_API_BASE  — defaults to https://admin.gonnaorder.com/api/v1
//   GONNAORDER_USERNAME  — required
//   GONNAORDER_PASSWORD  — required
//
// IMPORTANT: server-side only. Never bundled to the browser.

const DEFAULT_BASE = 'https://admin.gonnaorder.com/api/v1'

export type GoOrderItem = {
  name?: string | null
  quantity?: number | null
  price?: number | null               // EUR decimal
  // Other fields exist in GO payloads — we keep them in raw_payload only.
}

export type GoOrder = {
  orderId: number | string            // primary id used in URLs
  uuid?: string | null                // cross-store unique id
  orderToken?: string | null
  token?: string | null               // alternative key for orderToken in some payloads
  voucherCode?: string | null
  createdAt?: string | null           // ISO timestamp
  submittedAt?: string | null
  wishTime?: string | null            // ISO timestamp — "when the customer wants the order"
  status?: string | null              // e.g. 'CLOSED', 'CANCELLED'
  totalNonDiscountedPrice?: number | null   // gross EUR decimal
  voucherDiscount?: number | null           // benefit applied EUR decimal
  totalDiscountedPrice?: number | null      // employee top-up EUR decimal
  orderItems?: GoOrderItem[] | null
  // Many other fields possible — keep `[k: string]: any` for raw_payload safety
  [key: string]: unknown
}

let cachedJwt: string | null = null
let cachedBase: string | null = null

function readEnv() {
  const base = process.env.GONNAORDER_API_BASE ?? DEFAULT_BASE
  const username = process.env.GONNAORDER_USERNAME
  const password = process.env.GONNAORDER_PASSWORD
  if (!username || !password) {
    throw new Error(
      'GonnaOrder: missing GONNAORDER_USERNAME / GONNAORDER_PASSWORD env vars',
    )
  }
  return { base, username, password }
}

async function authenticate(): Promise<string> {
  const { base, username, password } = readEnv()
  const res = await fetch(`${base}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`GonnaOrder auth failed (${res.status}): ${body.slice(0, 200)}`)
  }
  const data = (await res.json()) as { tokens?: { jwt?: string } }
  const jwt = data.tokens?.jwt
  if (!jwt) throw new Error('GonnaOrder auth: response missing tokens.jwt')
  cachedJwt = jwt
  cachedBase = base
  return jwt
}

async function ensureToken(): Promise<{ jwt: string; base: string }> {
  if (!cachedJwt) await authenticate()
  return { jwt: cachedJwt!, base: cachedBase ?? DEFAULT_BASE }
}

/**
 * Authenticated POST. Re-auths once on 401, then re-throws.
 */
async function postWithAuth(path: string, body: unknown): Promise<Response> {
  let { jwt, base } = await ensureToken()
  let res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify(body),
  })
  if (res.status === 401) {
    cachedJwt = null
    jwt = await authenticate()
    res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify(body),
    })
  }
  return res
}

function pickOrders(payload: unknown): GoOrder[] {
  if (Array.isArray(payload)) return payload as GoOrder[]
  if (payload && typeof payload === 'object') {
    const p = payload as { data?: unknown; content?: unknown }
    if (Array.isArray(p.data)) return p.data as GoOrder[]
    if (Array.isArray(p.content)) return p.content as GoOrder[]
  }
  return []
}

export type ListOrdersOpts = {
  storeId: string
  since?: Date | null      // stop paginating once orders go older than this (uses wishTime)
  pageSize?: number        // default 100
  status?: string[]        // default ['CLOSED'] — match Base44
  isReady?: boolean        // default false — match Base44
}

/**
 * Fetch all orders for a GO store, paginated. Sorted by wishTime DESC so we
 * can early-stop once we cross the `since` boundary.
 *
 * Note: orders without `wishTime` are kept (we don't know when they were for,
 * so we don't drop them — they'll be filtered downstream if needed).
 */
export async function listOrders(opts: ListOrdersOpts): Promise<GoOrder[]> {
  const pageSize = opts.pageSize ?? 100
  const status = opts.status ?? ['CLOSED']
  const isReady = opts.isReady ?? false
  const since = opts.since ? opts.since.getTime() : null

  const all: GoOrder[] = []
  let page = 0
  while (true) {
    const path = `/stores/${encodeURIComponent(opts.storeId)}/orders/search` +
      `?size=${pageSize}&page=${page}&sort=wishTime,desc`
    const res = await postWithAuth(path, { status, isReady })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(
        `GonnaOrder listOrders failed for store ${opts.storeId} ` +
        `(status ${res.status}): ${body.slice(0, 200)}`,
      )
    }
    const json = await res.json()
    const orders = pickOrders(json)
    if (orders.length === 0) break

    let crossedBoundary = false
    for (const o of orders) {
      if (since !== null && o.wishTime) {
        const t = Date.parse(o.wishTime)
        if (Number.isFinite(t) && t < since) {
          crossedBoundary = true
          continue   // skip but keep scanning the page in case of out-of-order wishTimes
        }
      }
      all.push(o)
    }

    if (crossedBoundary) break          // results are sorted desc — once we see anything older, we're done
    if (orders.length < pageSize) break // last page
    page++
    if (page > 1000) {                  // safety belt — 100k orders per store is enough for any sane sync
      throw new Error(`GonnaOrder listOrders: refusing to paginate past page ${page}`)
    }
  }
  return all
}

/**
 * Fetch a single order by its GO uuid (or numeric id). Used by the webhook
 * handler to enrich incoming events — webhook payloads omit fields like
 * voucherCode / voucherDiscount / orderItems on UPDATE events; the detail
 * endpoint returns them.
 *
 * Tries `GET /stores/{storeId}/orders/{orderUuid}` first (REST convention).
 * Falls back to the orders/search endpoint with a status-agnostic page scan
 * if the detail endpoint isn't available.
 */
export async function getOrder(storeId: string, orderUuid: string): Promise<GoOrder | null> {
  // Try GET first.
  const direct = await requestWithAuth('GET', `/stores/${encodeURIComponent(storeId)}/orders/${encodeURIComponent(orderUuid)}`)
  if (direct.ok) {
    const json = await direct.json().catch(() => null) as GoOrder | null
    if (json) return json
  }
  // Fall back: search the first few pages for the matching uuid.
  for (let page = 0; page < 5; page++) {
    const res = await postWithAuth(
      `/stores/${encodeURIComponent(storeId)}/orders/search?size=100&page=${page}&sort=createdAt,desc`,
      { status: [], isReady: false },
    )
    if (!res.ok) break
    const arr = pickOrders(await res.json())
    const hit = arr.find((o) => (o.uuid && String(o.uuid) === orderUuid) || (o.orderId !== undefined && String(o.orderId) === orderUuid))
    if (hit) return hit
    if (arr.length < 100) break
  }
  return null
}

// ────────────────────────────────────────────────────────────────────────────
// Customer vouchers (GO)
//
// Endpoints + payload shapes derived from the user's working n8n scripts
// "Voucher Creation" + "Gonna Order Vouchers Update" (2026-05). Current
// production model: per-store PERCENTILE discounts (e.g. 5%) on MULTI_USE
// vouchers, refreshed daily via PUT (startDate→now, endDate→+6mo).
//
//   POST  /stores/{storeId}/customer-voucher              → create
//   PUT   /stores/{storeId}/customer-voucher/{voucherId}  → update
//   GET   /stores/{storeId}/customer-voucher?size=N       → list { data: [...] }
// ────────────────────────────────────────────────────────────────────────────

export type GoVoucher = {
  id?: string
  code?: string
  startDate?: string
  endDate?: string
  discount?: number
  orderMinAmount?: number
  initialValue?: number | null
  type?: 'MULTI_USE' | 'SINGLE_USE' | string
  discountType?: 'PERCENTILE' | 'MONETARY' | string
  isActive?: boolean
  [k: string]: unknown
}

export type CreateVoucherInput = {
  storeId: string
  code: string
  discount: number                  // % when discountType=PERCENTILE, EUR when ABSOLUTE
  discountType?: 'PERCENTILE' | 'MONETARY'
  type?: 'MULTI_USE' | 'SINGLE_USE'
  startDate?: Date | string         // default: now
  endDate?: Date | string           // default: now + 6 months
  orderMinAmount?: number           // default 0
  initialValue?: number | null      // default null (PERCENTILE) or EUR amount (ABSOLUTE-balance)
  isActive?: boolean                // default true
}

async function requestWithAuth(method: 'GET' | 'POST' | 'PUT' | 'DELETE', path: string, body?: unknown): Promise<Response> {
  let { jwt, base } = await ensureToken()
  const init = (j: string): RequestInit => ({
    method,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${j}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  let res = await fetch(`${base}${path}`, init(jwt))
  if (res.status === 401) {
    cachedJwt = null
    jwt = await authenticate()
    res = await fetch(`${base}${path}`, init(jwt))
  }
  return res
}

function isoOrString(v: Date | string | undefined, fallback: Date): string {
  if (!v) return fallback.toISOString()
  return typeof v === 'string' ? v : v.toISOString()
}

export async function createVoucher(input: CreateVoucherInput): Promise<GoVoucher> {
  const now = new Date()
  const sixMo = new Date(now); sixMo.setMonth(sixMo.getMonth() + 6)
  const body = {
    code: input.code,
    startDate: isoOrString(input.startDate, now),
    endDate: isoOrString(input.endDate, sixMo),
    discount: input.discount,
    orderMinAmount: input.orderMinAmount ?? 0,
    initialValue: input.initialValue ?? null,
    type: input.type ?? 'MULTI_USE',
    discountType: input.discountType ?? 'PERCENTILE',
    isActive: input.isActive ?? true,
    categoryIds: null,
    scheduleId: 'null',           // GO accepts the string "null" per n8n convention; null also works
    externalId: null,
    durationInMonths: null,
  }
  const res = await requestWithAuth('POST', `/stores/${encodeURIComponent(input.storeId)}/customer-voucher`, body)
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`GO createVoucher failed (${res.status}): ${txt.slice(0, 300)}`)
  }
  return (await res.json()) as GoVoucher
}

export type UpdateVoucherInput = {
  storeId: string
  voucherId: string
  fields: Partial<Pick<GoVoucher, 'code' | 'startDate' | 'endDate' | 'discount' | 'isActive' | 'initialValue' | 'type' | 'discountType' | 'orderMinAmount'>>
}

export async function updateVoucher(input: UpdateVoucherInput): Promise<GoVoucher> {
  const res = await requestWithAuth(
    'PUT',
    `/stores/${encodeURIComponent(input.storeId)}/customer-voucher/${encodeURIComponent(input.voucherId)}`,
    input.fields,
  )
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`GO updateVoucher failed (${res.status}): ${txt.slice(0, 300)}`)
  }
  return (await res.json()) as GoVoucher
}

export async function listVouchers(storeId: string, pageSize = 100): Promise<GoVoucher[]> {
  const res = await requestWithAuth('GET', `/stores/${encodeURIComponent(storeId)}/customer-voucher?size=${pageSize}`)
  if (!res.ok) {
    const txt = await res.text().catch(() => '')
    throw new Error(`GO listVouchers failed (${res.status}): ${txt.slice(0, 300)}`)
  }
  const json = await res.json() as { data?: GoVoucher[] } | GoVoucher[]
  if (Array.isArray(json)) return json
  return json.data ?? []
}

/**
 * Find an existing voucher by exact `code` match. Case-sensitive — GO appears
 * to preserve case. Returns null if no voucher with that code exists.
 */
export async function findVoucherByCode(storeId: string, code: string): Promise<GoVoucher | null> {
  const all = await listVouchers(storeId)
  return all.find((v) => v.code === code) ?? null
}

/**
 * Reset the cached JWT — exposed for tests / scripts that want a fresh login.
 */
export function _resetGonnaOrderAuth() {
  cachedJwt = null
  cachedBase = null
}
