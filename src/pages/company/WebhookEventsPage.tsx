import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useUIStore } from '../../store/useUIStore'
import { Icon, Pill } from '../../lib/specui'

type Event = {
  id: string; source: string; event_type: string | null
  external_order_id: string | null; dedupe_key: string | null
  processed: boolean; error: string | null
  received_at: string; payload: Record<string, unknown>
}

export default function WebhookEventsPage() {
  const { session } = useAuthStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const token = session?.access_token

  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  async function load() {
    if (!token) return
    setLoading(true); setError(null)
    try {
      const r = await fetch('/api/cf-webhook-events?limit=100', { headers: { authorization: `Bearer ${token}` } })
      if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `HTTP ${r.status}`) }
      const d = await r.json(); setEvents(d.events ?? [])
    } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() /* eslint-disable-next-line */ }, [token])

  return (
    <section className="p-8 space-y-6 max-w-[1100px]">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="font-display text-[36px] leading-[44px] font-semibold">{L('Webhook events', 'Webhook events')}</h1>
          <p className="text-ink-soft mt-2 text-[15px]">{L('Όλα τα εισερχόμενα events από το GonnaOrder. Source of truth: webhook_events.', 'Every inbound event from GonnaOrder. Source of truth: webhook_events.')}</p>
        </div>
        <button onClick={() => void load()} className="inline-flex items-center justify-center gap-2 h-10 px-4 bg-surface text-ink border border-line hover:border-ink-soft rounded text-[14px] font-medium">
          <Icon name="history" /><span>{L('Ανανέωση', 'Refresh')}</span>
        </button>
      </div>

      {error && <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}
      {loading && events.length === 0 && <div className="text-ink-soft">{L('Φόρτωση…', 'Loading…')}</div>}

      {events.length === 0 && !loading ? (
        <div className="rounded-md border border-dashed border-line bg-surface p-12 text-center text-ink-faint">{L('Κανένα event ακόμη — βεβαιωθείτε ότι το webhook URL είναι ρυθμισμένο στο GonnaOrder.', 'No events yet — make sure the webhook URL is configured in GonnaOrder.')}</div>
      ) : (
        <div className="bg-surface border border-line rounded-md shadow-sm divide-y divide-line">
          {events.map((e) => {
            const tone = !e.processed ? 'warn' : e.error ? 'danger' : 'success'
            const open = expanded === e.id
            return (
              <div key={e.id} className="p-4">
                <button onClick={() => setExpanded(open ? null : e.id)} className="w-full flex items-center gap-3 text-left">
                  <Pill tone={tone}>{e.event_type ?? '?'}</Pill>
                  <span className="font-mono text-[12px] text-ink-soft truncate flex-1">{e.external_order_id ?? '—'}</span>
                  <span className="text-[11.5px] text-ink-faint font-mono">{new Date(e.received_at).toLocaleString(lang === 'el' ? 'el-GR' : 'en-GB')}</span>
                  <span className="text-ink-faint"><Icon name={open ? 'chevron_d' : 'chevron_r'} size={14} /></span>
                </button>
                {e.error && <div className="mt-2 text-[12.5px] text-danger">{e.error}</div>}
                {open && (
                  <pre className="mt-3 bg-bg/60 border border-line rounded p-3 text-[11.5px] font-mono leading-[16px] overflow-auto max-h-96">{JSON.stringify(e.payload, null, 2)}</pre>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
