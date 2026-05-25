import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useCompanyStore } from '../../store/useCompanyStore'
import { useUIStore } from '../../store/useUIStore'

type Vendor = {
  agreementId: string; status: string; stickerMode: string; reusableContainers: string
  startDate: string; endDate: string | null
  vendor: { id: string; name: string; legalName: string | null; discountPercentage: number; discountAppliesTo: string; tags: string[] } | null
  deliveryWindows: { from: string; to: string }[]
  shopIds: string[]
}

export default function VendorsPage() {
  const { session } = useAuthStore()
  const { selectedId } = useCompanyStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const token = session?.access_token

  const [rows, setRows] = useState<Vendor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token || !selectedId) return
    setLoading(true); setError(null)
    ;(async () => {
      try {
        const r = await fetch(`/api/cf-vendors?companyId=${selectedId}`, { headers: { authorization: `Bearer ${token}` } })
        if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `HTTP ${r.status}`) }
        const d = await r.json(); setRows(d.vendors ?? [])
      } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
      finally { setLoading(false) }
    })()
  }, [token, selectedId])

  return (
    <div className="p-8 max-w-[1100px]">
      <h1 className="mb-1 font-display text-3xl font-semibold text-ink">{L('Συνεργάτες', 'Vendors')}</h1>
      <p className="mb-6 text-sm text-ink-soft">{L('Οι προμηθευτές φαγητού της εταιρείας σας', 'Your company’s food vendors')}</p>

      {error && <div className="mb-4 text-sm text-danger">{error}</div>}
      {loading ? <div className="text-ink-soft">{L('Φόρτωση…', 'Loading…')}</div> : rows.length === 0 ? (
        <div className="rounded-xl border border-line bg-surface p-6 text-center text-ink-faint">{L('Κανένας συνεργάτης ακόμη', 'No vendors yet')}</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map((v) => (
            <div key={v.agreementId} className="rounded-xl border border-line bg-surface p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-display text-xl font-semibold text-ink">{v.vendor?.name ?? '—'}</div>
                  {v.vendor?.legalName && <div className="text-xs text-ink-faint">{v.vendor.legalName}</div>}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${v.status === 'active' ? 'bg-brand-soft text-brand' : 'bg-bg text-ink-soft'}`}>{v.status}</span>
              </div>

              {v.vendor && v.vendor.tags.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {v.vendor.tags.map((t) => <span key={t} className="rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent-hover">{t}</span>)}
                </div>
              )}

              <dl className="mt-4 grid grid-cols-2 gap-y-2 text-sm">
                <dt className="text-ink-faint">{L('Έκπτωση', 'Discount')}</dt>
                <dd className="text-right text-ink">{v.vendor?.discountPercentage ?? 0}% · {v.vendor?.discountAppliesTo === 'benefit_price' ? L('στην παροχή', 'on benefit') : L('στο σύνολο', 'on total')}</dd>

                <dt className="text-ink-faint">{L('Ετικέτα', 'Sticker')}</dt>
                <dd className="text-right text-ink">{v.stickerMode === 'employee_name' ? L('όνομα υπαλλήλου', 'employee name') : L('ανώνυμο', 'anonymized')}</dd>

                <dt className="text-ink-faint">{L('Σκεύη', 'Containers')}</dt>
                <dd className="text-right text-ink">{v.reusableContainers}</dd>

                <dt className="text-ink-faint">{L('Παράδοση', 'Delivery')}</dt>
                <dd className="text-right text-ink">{v.deliveryWindows.map((w) => `${w.from.slice(0,5)}–${w.to.slice(0,5)}`).join(', ') || '—'}</dd>

                <dt className="text-ink-faint">{L('Κατάστημα GO', 'GO store')}</dt>
                <dd className="text-right font-mono text-xs text-ink">{v.shopIds.join(', ') || '—'}</dd>

                <dt className="text-ink-faint">{L('Από', 'Since')}</dt>
                <dd className="text-right text-ink">{v.startDate}</dd>
              </dl>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
