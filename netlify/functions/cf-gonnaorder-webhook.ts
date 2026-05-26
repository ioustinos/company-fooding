// cf-gonnaorder-webhook — receive live order events from GonnaOrder.
//
// Endpoint:  POST  /api/cf-gonnaorder-webhook?key=<CF_WEBHOOK_KEY>
// Health:    GET   /api/cf-gonnaorder-webhook?key=<CF_WEBHOOK_KEY>   → { ok: true }
//
// GO can fire on every order state transition (we configure the URL on the
// store side). We auth via a shared secret in the URL — minimal but workable;
// rotate by changing CF_WEBHOOK_KEY env var and re-saving on the GO side.
//
// Event handling:
//   ORDER_SUBMITTED / ORDER_UPDATED / ORDER_CONFIRMED / ORDER_PAID
//   / ORDER_DELIVERED / ORDER_CLOSED  → upsert order, status follows
//   STATUS_MAP from parseGonnaOrder.
//   ORDER_CANCELLED / ORDER_CANCELED / ORDER_DELETED → mark existing
//   order status='cancelled'; we never destroy the row (cycle "used"
//   calc filters cancelled out).
//
// Idempotency: dedupe_key = `gonnaorder|<event_type>|<external_order_id>`.
// A retried webhook with the same key is logged but does not re-process.
//
// Always returns 200 (even on parse error) so GO doesn't retry forever.
// Errors are stored on the webhook_events row for forensic review.

import type { Context } from '@netlify/functions'
import { ok, methodNotAllowed } from './_shared/errors'
import { supabaseAdmin } from './_shared/supabaseAdmin'
import { parseOrder } from './_shared/parseGonnaOrder'
import type { GoOrder } from './_shared/gonnaorder'

const CANCEL_TYPES = new Set(['ORDER_CANCELLED', 'ORDER_CANCELED', 'ORDER_DELETED'])
const UPSERT_TYPES = new Set([
  'ORDER_SUBMITTED', 'ORDER_UPDATED', 'ORDER_CONFIRMED', 'ORDER_PAID',
  'ORDER_DELIVERED', 'ORDER_CLOSED', 'ORDER_PREPARING', 'ORDER_READY',
])

function bad(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  })
}

export default async (req: Request, _ctx: Context) => {
  const url = new URL(req.url)
  const key = url.searchParams.get('key')
  const expected = process.env.CF_WEBHOOK_KEY

  // health-check GET
  if (req.method === 'GET') {
    if (!expected) return bad(500, { ok: false, error: 'CF_WEBHOOK_KEY not configured' })
    if (key !== expected) return bad(401, { ok: false, error: 'bad key' })
    return ok({ ok: true, endpoint: 'cf-gonnaorder-webhook', ready: true })
  }
  if (req.method !== 'POST') return methodNotAllowed(['GET', 'POST'])

  if (!expected) return bad(500, { error: 'CF_WEBHOOK_KEY not configured' })
  if (key !== expected) return bad(401, { error: 'bad key' })

  // Parse body — be defensive, GO's exact shape will firm up after first real events.
  let payload: Record<string, unknown> = {}
  try { payload = (await req.json()) as Record<string, unknown> } catch { /* keep empty */ }

  const eventType = String(
    payload.event ?? payload.event_type ?? payload.type ?? 'UNKNOWN',
  ).toUpperCase()

  // The order object may be the body itself or wrapped under `order` / `data`.
  const orderData = ((payload.order ?? payload.data ?? payload) as Record<string, unknown>) || {}
  const externalId = String(
    orderData.orderId ?? orderData.id ?? orderData.uuid ?? '',
  ) || null

  const dedupeKey = `gonnaorder|${eventType}|${externalId ?? 'none'}`
  const sb = supabaseAdmin()

  // Persist the raw event first. Unique constraint on dedupe_key makes retries
  // a no-op insert (we still return 200 to GO).
  const { error: insErr } = await sb.from('webhook_events').insert({
    source: 'gonnaorder',
    event_type: eventType,
    external_order_id: externalId,
    dedupe_key: dedupeKey,
    payload,
  })
  if (insErr && !/duplicate key/i.test(insErr.message)) {
    return ok({ received: true, warning: `event-store: ${insErr.message}` })
  }
  if (insErr) {
    // duplicate → already processed, return ok
    return ok({ received: true, deduped: true, dedupeKey })
  }

  // Process the event.
  try {
    if (!externalId) {
      await sb.from('webhook_events').update({ processed: true, error: 'no external order id' }).eq('dedupe_key', dedupeKey)
      return ok({ received: true, ignored: 'no external order id', dedupeKey })
    }

    if (CANCEL_TYPES.has(eventType)) {
      // Soft cancel: flip status if row exists; if not, insert a stub row so
      // it's visible in the cancelled set when the order eventually syncs.
      const { data: existing } = await sb.from('orders')
        .select('id').eq('external_order_id', externalId).maybeSingle()
      if (existing) {
        await sb.from('orders').update({ status: 'cancelled' }).eq('id', existing.id)
      } else {
        await sb.from('orders').insert({
          source: 'gonnaorder',
          external_order_id: externalId,
          status: 'cancelled',
          subtotal: 0, benefit_applied: 0, topup_amount: 0, total: 0,
          placed_at: new Date().toISOString(),
          raw_payload: payload,
        })
      }
      await sb.from('webhook_events').update({ processed: true }).eq('dedupe_key', dedupeKey)
      return ok({ received: true, action: 'cancelled', externalId })
    }

    if (UPSERT_TYPES.has(eventType)) {
      // Best-effort: try to parse the full GO order shape. If the webhook
      // payload is a slim status-only event, we just touch the row's status.
      try {
        const parsed = parseOrder(orderData as unknown as GoOrder)
        // Upsert by external_order_id
        await sb.from('orders').upsert(parsed.order, { onConflict: 'external_order_id' })
      } catch {
        // Slim payload — just upsert minimal fields
        await sb.from('orders').upsert({
          source: 'gonnaorder',
          external_order_id: externalId,
          status: 'confirmed',
          subtotal: 0, benefit_applied: 0, topup_amount: 0, total: 0,
          placed_at: new Date().toISOString(),
          raw_payload: payload,
        }, { onConflict: 'external_order_id' })
      }
      await sb.from('webhook_events').update({ processed: true }).eq('dedupe_key', dedupeKey)
      return ok({ received: true, action: 'upserted', externalId, eventType })
    }

    // Unknown event type — log + ignore.
    await sb.from('webhook_events').update({ processed: true, error: `unhandled event_type ${eventType}` }).eq('dedupe_key', dedupeKey)
    return ok({ received: true, ignored: 'unhandled event_type', eventType })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await sb.from('webhook_events').update({ processed: true, error: msg }).eq('dedupe_key', dedupeKey)
    // Still 200 — we own the row; don't ask GO to retry into the same error
    return ok({ received: true, error: msg, eventType, externalId })
  }
}
