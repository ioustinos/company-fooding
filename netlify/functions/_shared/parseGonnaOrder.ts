// Pure mapping: GonnaOrder payload → CF orders + order_items rows.
//
// Money: GO returns EUR DECIMAL (e.g. 12.50). CF stores INT CENTS (1250).
// We Math.round(× 100) to avoid float-residue bugs.
//
// Status: GO uses uppercase string enums (CLOSED, CANCELLED, etc.). We map
// to our `order_status_mirror` enum where it makes sense; unknowns fall
// through as 'confirmed' to avoid losing rows. The full GO status is
// preserved in raw_payload.

import type { GoOrder, GoOrderItem } from './gonnaorder'

const STATUS_MAP: Record<string, string> = {
  PENDING:    'pending',
  CONFIRMED:  'confirmed',
  PREPARING:  'preparing',
  DELIVERING: 'delivering',
  DELIVERED:  'delivered',
  CLOSED:     'delivered',     // CLOSED in GO ≈ done & invoiceable
  CANCELLED:  'cancelled',
  CANCELED:   'cancelled',     // US spelling
}

export type ParsedOrderRow = {
  source: 'gonnaorder'
  external_order_id: string
  external_uuid: string | null
  order_token: string | null
  voucher_code: string | null
  subtotal: number              // cents
  benefit_applied: number       // cents
  topup_amount: number          // cents
  total: number                 // cents
  delivery_date: string | null  // YYYY-MM-DD (Europe/Athens)
  time_from: string | null      // HH:MM:SS
  time_to: string | null
  status: string                // mapped enum
  placed_at: string             // ISO timestamptz
  raw_payload: GoOrder          // full GO payload for debugging
}

export type ParsedItemRow = {
  external_item_id: string | null
  name_el: string | null
  name_en: string | null
  variant_label_el: string | null
  variant_label_en: string | null
  quantity: number
  unit_price: number            // cents
  total_price: number           // cents
  tags: string[]
}

function eurToCents(v: unknown): number {
  if (v === null || v === undefined) return 0
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.round(n * 100)
}

function isoDateAthens(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  // Format YYYY-MM-DD in Europe/Athens
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Athens',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return fmt.format(d)              // en-CA gives YYYY-MM-DD
}

function isoTimeAthens(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Athens',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  })
  return fmt.format(d)              // HH:MM:SS
}

export function parseOrder(go: GoOrder): {
  order: ParsedOrderRow
  items: ParsedItemRow[]
} {
  const externalId = String(go.orderId)
  const status = (go.status ?? '').toUpperCase()
  const placedAtIso = go.createdAt ?? go.submittedAt ?? new Date().toISOString()

  const order: ParsedOrderRow = {
    source: 'gonnaorder',
    external_order_id: externalId,
    external_uuid: go.uuid ?? null,
    order_token: go.orderToken ?? go.token ?? null,
    voucher_code: go.voucherCode ?? null,
    subtotal:        eurToCents(go.totalNonDiscountedPrice),
    benefit_applied: eurToCents(go.voucherDiscount),
    topup_amount:    eurToCents(go.totalDiscountedPrice),
    total:           eurToCents(go.totalNonDiscountedPrice),  // gross stays the gross
    delivery_date: isoDateAthens(go.wishTime),
    time_from:     isoTimeAthens(go.wishTime),
    time_to:       isoTimeAthens(go.wishTime),
    status: STATUS_MAP[status] ?? 'confirmed',
    placed_at: new Date(placedAtIso).toISOString(),
    raw_payload: go,
  }

  const items: ParsedItemRow[] = (go.orderItems ?? []).map((it: GoOrderItem) => {
    const qty = Number(it.quantity ?? 1) || 1
    const unitCents = eurToCents(it.price)
    return {
      external_item_id: null,
      name_el: it.name ?? null,
      name_en: it.name ?? null,
      variant_label_el: null,
      variant_label_en: null,
      quantity: qty,
      unit_price: unitCents,
      total_price: unitCents * qty,
      tags: [],
    }
  })

  return { order, items }
}

/**
 * Dedup an array of GO orders by uuid (fall back to orderId). Same physical
 * order can appear in multiple stores' result sets in the parent-store model.
 */
export function dedupGoOrders(orders: GoOrder[]): GoOrder[] {
  const seen = new Set<string>()
  const out: GoOrder[] = []
  for (const o of orders) {
    const key = o.uuid ?? String(o.orderId)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(o)
  }
  return out
}
