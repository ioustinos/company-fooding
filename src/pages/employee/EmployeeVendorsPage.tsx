import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useUIStore } from '../../store/useUIStore'
import { Icon } from '../../lib/specui'

type VendorMatch = {
  agreement_id: string; sticker_mode: string
  vendor: { id: string; name: string; legal_name: string | null; discount_percentage: number; discount_applies_to: string; tags: string[] | null } | null
  windows: { from: string; to: string }[]
  shop_ids: string[]
}
type Home = { vendors: VendorMatch[] }

export default function EmployeeVendorsPage() {
  const { session } = useAuthStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const [data, setData] = useState<Home | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!session?.access_token) return
    ;(async () => {
      try {
        const r = await fetch('/api/cf-employee-home', { headers: { authorization: `Bearer ${session.access_token}` } })
        if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `HTTP ${r.status}`) }
        setData(await r.json())
      } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
      finally { setLoading(false) }
    })()
  }, [session?.access_token])

  const list = (data?.vendors ?? []).filter((v) => {
    if (!v.vendor) return false
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return v.vendor.name.toLowerCase().includes(q) || (v.vendor.tags ?? []).some((t) => t.toLowerCase().includes(q))
  })

  return (
    <section className="p-8 max-w-[1100px] mx-auto space-y-6">
      <div>
        <h1 className="font-display text-[36px] leading-[44px] font-semibold">{L('Πού μπορώ να παραγγείλω', 'Where can I order')}</h1>
        <p className="text-ink-soft mt-2 text-[15px]">{L('Συνεργαζόμενα καταστήματα της εταιρείας σας.', 'Your company’s partner vendors.')}</p>
      </div>

      <div className="max-w-md relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"><Icon name="search" /></span>
        <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder={L('Αναζήτηση καταστήματος ή ετικέτας…', 'Search vendor or tag…')}
          className="w-full h-10 pl-10 pr-3 bg-surface border border-line rounded-xs text-[14px] placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15" />
      </div>

      {error && <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}
      {loading && !data && <div className="text-ink-soft">{L('Φόρτωση…', 'Loading…')}</div>}
      {data && (list.length === 0 ? (
        <div className="rounded-md border border-dashed border-line bg-surface p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-accent-soft text-accent mb-3"><Icon name="shop" /></div>
          <div className="font-display text-[20px] font-semibold">{data.vendors.length === 0 ? L('Κανένα κατάστημα ακόμη', 'No vendors yet') : L('Καμία αντιστοιχία', 'No matches')}</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map((v) => v.vendor && (
            <a key={v.agreement_id}
              href={v.shop_ids[0] ? `https://gonnaorder.com/${v.shop_ids[0]}` : '#'}
              target="_blank" rel="noreferrer"
              className="group bg-surface border border-line rounded-md shadow-sm p-5 hover:border-ink-soft transition block">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded bg-accent-soft text-accent flex items-center justify-center shrink-0"><Icon name="shop" /></div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-[18px] font-semibold truncate">{v.vendor.name}</h3>
                  <div className="text-[11.5px] text-ink-faint truncate">{v.windows.map((w) => `${w.from.slice(0, 5)}–${w.to.slice(0, 5)}`).join(', ') || '—'}</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1">
                {(v.vendor.tags ?? []).slice(0, 3).map((t) => (
                  <span key={t} className="inline-flex items-center px-2 py-0.5 rounded-xs text-[10.5px] font-semibold uppercase tracking-[0.08em] bg-bg border border-line text-ink-soft">{t}</span>
                ))}
              </div>
              <div className="mt-4 pt-3 border-t border-line flex items-center justify-between text-[12.5px]">
                <span className="text-ink-soft">{L('Ανοίξτε το κατάστημα →', 'Open store →')}</span>
                {v.vendor.discount_percentage > 0 && <span className="text-brand font-semibold">−{v.vendor.discount_percentage}% {L('για εσάς', 'for you')}</span>}
              </div>
            </a>
          ))}
        </div>
      ))}
    </section>
  )
}
