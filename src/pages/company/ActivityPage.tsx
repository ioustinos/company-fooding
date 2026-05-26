import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useCompanyStore } from '../../store/useCompanyStore'
import { useUIStore } from '../../store/useUIStore'
import { ActIcon } from '../../lib/specui'

type Event = { id: string; kind: string; actor_email: string | null; summary_el: string | null; summary_en: string | null; created_at: string; target_type: string | null; target_id: string | null }

function actKind(kind: string): 'order' | 'signup' | 'invoice' | 'benefit_start' | 'topup_failed' {
  if (kind.startsWith('employee.')) return 'signup'
  if (kind.startsWith('benefit.assigned')) return 'benefit_start'
  if (kind.startsWith('benefit.')) return 'invoice'
  return 'order'
}
function relTime(iso: string, lang: 'el' | 'en') {
  const t = new Date(iso).getTime(); const now = Date.now()
  const diffMin = Math.round((now - t) / 60000)
  if (diffMin < 1) return lang === 'el' ? 'μόλις τώρα' : 'just now'
  if (diffMin < 60) return lang === 'el' ? `πριν ${diffMin} λεπτά` : `${diffMin} min ago`
  const h = Math.round(diffMin / 60); if (h < 24) return lang === 'el' ? `πριν ${h} ώρες` : `${h}h ago`
  const d = Math.round(h / 24); return lang === 'el' ? `πριν ${d} μέρες` : `${d}d ago`
}

export default function ActivityPage() {
  const { session } = useAuthStore()
  const { selectedId } = useCompanyStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const token = session?.access_token

  const [events, setEvents] = useState<Event[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token || !selectedId) return
    setLoading(true); setError(null)
    ;(async () => {
      try {
        const r = await fetch(`/api/cf-activity?companyId=${selectedId}&limit=200`, { headers: { authorization: `Bearer ${token}` } })
        if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `HTTP ${r.status}`) }
        const d = await r.json(); setEvents(d.events ?? [])
      } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
      finally { setLoading(false) }
    })()
  }, [token, selectedId])

  return (
    <section className="p-8 space-y-6 max-w-[1100px]">
      <div>
        <h1 className="font-display text-[36px] leading-[44px] font-semibold">{L('Δραστηριότητα', 'Activity')}</h1>
        <p className="text-ink-soft mt-2 text-[15px]">{L('Καταγραφή ενεργειών στην εταιρεία σας — ποιος έκανε τι, πότε.', 'Audit log of company actions — who did what, when.')}</p>
      </div>

      {error && <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}
      {loading && events.length === 0 && <div className="text-ink-soft">{L('Φόρτωση…', 'Loading…')}</div>}

      {events.length === 0 && !loading ? (
        <div className="rounded-md border border-dashed border-line bg-surface p-12 text-center text-ink-faint">{L('Καμία δραστηριότητα ακόμη.', 'No activity yet.')}</div>
      ) : (
        <div className="bg-surface border border-line rounded-md shadow-sm divide-y divide-line">
          {events.map((e) => (
            <div key={e.id} className="p-4 flex items-start gap-3">
              <ActIcon kind={actKind(e.kind)} />
              <div className="flex-1 min-w-0">
                <div className="text-[14px] text-ink">{lang === 'el' ? (e.summary_el || e.kind) : (e.summary_en || e.kind)}</div>
                <div className="text-[11.5px] text-ink-faint font-mono mt-0.5">
                  {relTime(e.created_at, lang)} · {e.actor_email ?? 'system'} · <span className="text-ink-faint">{e.kind}</span>
                </div>
              </div>
              <div className="text-[11px] text-ink-faint font-mono shrink-0">{new Date(e.created_at).toLocaleString(lang === 'el' ? 'el-GR' : 'en-GB')}</div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
