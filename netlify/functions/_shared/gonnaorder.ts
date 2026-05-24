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
 * Reset the cached JWT — exposed for tests / scripts that want a fresh login.
 */
export function _resetGonnaOrderAuth() {
  cachedJwt = null
  cachedBase = null
}
