import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import { useCompanyStore } from '../../store/useCompanyStore'
import { useUIStore } from '../../store/useUIStore'
import { Icon, KPI } from '../../lib/specui'

type Vendor = {
  agreementId: string; status: string; stickerMode: string; reusableContainers: string
  startDate: string; endDate: string | null
  vendor: { id: string; name: string; legalName: string | null; discountPercentage: number; discountAppliesTo: string; tags: string[] } | null
  deliveryWindows: { from: string; to: string }[]
  shopIds: string[]
}

const tagTone: Record<string, string> = {
  daily: 'bg-brand-soft text-brand',
  cooked: 'bg-accent-soft text-accent',
  healthy: 'bg-[#E5F1EB] text-success',
  traditional: 'bg-[#FBF1DA] text-[#A37620]',
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
  const [search, setSearch] = useState('')

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

  const connected = useMemo(() => rows.filter((v) => v.shopIds.length > 0).length, [rows])
  const active = useMemo(() => rows.filter((v) => v.status === 'active').length, [rows])

  const filtered = useMemo(() => {
    if (!search.trim()) return rows
    const q = search.toLowerCase()
    return rows.filter((v) => (v.vendor?.name || '').toLowerCase().includes(q) || (v.vendor?.tags || []).some((t) => t.toLowerCase().includes(q)))
  }, [rows, search])

  return (
    <section className="p-8 space-y-6 max-w-[1100px]">
      <div className="flex items-start justify-between gap-6">
        <div>
          <h1 className="font-display text-[36px] leading-[44px] font-semibold">{L('Συνεργάτες', 'Vendors')}</h1>
          <p className="text-ink-soft mt-2 text-[15px] max-w-xl">{L('Τα καταστήματα φαγητού με τα οποία συνεργάζεται η εταιρεία σας.', "The food vendors your company partners with.")}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 max-w-2xl">
        <KPI label={L('Συνεργάτες', 'Partners')} value={rows.length} tone="brand" icon="handshake" />
        <KPI label={L('Ενεργοί', 'Active')} value={active} tone="success" icon="check" />
        <KPI label={L('Συνδεδεμένοι GO', 'GO connected')} value={connected} tone="accent" icon="shop"
          sub={rows.length > 0 ? `${Math.round(connected / rows.length * 100)}%` : undefined} />
      </div>

      <div className="flex items-center gap-3">
        <div className="max-w-xs relative flex-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint"><Icon name="search" /></span>
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={L('Αναζήτηση συνεργάτη ή ετικέτας…', 'Search vendor or tag…')}
            className="w-full h-10 pl-10 pr-3 bg-surface border border-line rounded-xs text-[14px] placeholder:text-ink-faint focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/15" />
        </div>
      </div>

      {error && <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}
      {loading ? (
        <div className="text-ink-soft">{L('Φόρτωση…', 'Loading…')}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-line bg-surface p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-soft text-brand mb-3"><Icon name="handshake" /></div>
          <div className="font-display text-[20px] font-semibold">{rows.length === 0 ? L('Κανένας συνεργάτης ακόμη', 'No vendors yet') : L('Καμία αντιστοιχία', 'No matches')}</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((v) => {
            const isConn = v.shopIds.length > 0
            const discountApplies = v.vendor?.discountAppliesTo === 'benefit_price'
              ? L('στην παροχή', 'on benefit')
              : L('στο σύνολο', 'on total')
            const windows = v.deliveryWindows.map((w) => `${w.from.slice(0, 5)}–${w.to.slice(0, 5)}`).join(', ')
            return (
              <Link key={v.agreementId} to={`/company/vendors/${v.agreementId}`} className="group bg-surface border border-line rounded-md shadow-sm p-5 hover:border-ink-soft transition block">
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded bg-accent-soft text-accent flex items-center justify-center shrink-0"><Icon name="shop" /></div>
                    <div className="min-w-0">
                      <h3 className="font-display text-[20px] font-semibold truncate leading-tight">{v.vendor?.name ?? '—'}</h3>
                      {v.vendor?.legalName && <div className="text-[11.5px] text-ink-faint truncate">{v.vendor.legalName}</div>}
                    </div>
                  </div>
                  <span className={`inline-flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] shrink-0 mt-1.5 ${isConn ? 'text-success' : 'text-[#A37620]'}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isConn ? 'bg-success' : 'bg-warn'}`}></span>
                    {isConn ? L('Συνδεδεμένο', 'Connected') : L('Εκκρεμεί', 'Pending')}
                  </span>
                </div>

                {/* Tags */}
                {v.vendor && v.vendor.tags.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {v.vendor.tags.map((tag) => (
                      <span key={tag} className={`inline-flex items-center px-2 py-0.5 rounded-xs text-[10.5px] font-semibold uppercase tracking-[0.08em] ${tagTone[tag] || 'bg-bg text-ink-soft border border-line'}`}>{tag}</span>
                    ))}
                  </div>
                )}

                {/* Discount strip */}
                <div className="mt-5 pt-4 border-t border-line flex items-center gap-6">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2">
                      <span className={`num font-display text-[26px] font-semibold leading-none ${(v.vendor?.discountPercentage ?? 0) > 0 ? 'text-brand' : 'text-ink-faint'}`}>
                        {(v.vendor?.discountPercentage ?? 0) > 0 ? `-${v.vendor!.discountPercentage}%` : '—'}
                      </span>
                    </div>
                    {(v.vendor?.discountPercentage ?? 0) > 0 && (
                      <div className="text-[10.5px] text-ink-faint mt-1">{discountApplies}</div>
                    )}
                  </div>
                  <div className="text-right text-[12px]">
                    <div className="text-ink-faint uppercase tracking-[0.06em] text-[10.5px] font-semibold">{L('Παράδοση', 'Delivery')}</div>
                    <div className="num text-ink mt-0.5">{windows || '—'}</div>
                  </div>
                </div>

                {/* Footer meta */}
                <div className="mt-4 pt-4 border-t border-line grid grid-cols-3 gap-3 text-[12px]">
                  <div>
                    <div className="text-ink-faint uppercase tracking-[0.06em] text-[10.5px] font-semibold">{L('Ετικέτα', 'Sticker')}</div>
                    <div className="text-ink mt-0.5">{v.stickerMode === 'employee_name' ? L('όνομα', 'name') : L('ανώνυμο', 'anon')}</div>
                  </div>
                  <div>
                    <div className="text-ink-faint uppercase tracking-[0.06em] text-[10.5px] font-semibold">{L('Σκεύη', 'Containers')}</div>
                    <div className="text-ink mt-0.5">{v.reusableContainers || '—'}</div>
                  </div>
                  <div>
                    <div className="text-ink-faint uppercase tracking-[0.06em] text-[10.5px] font-semibold">{L('GO store', 'GO store')}</div>
                    <div className="font-mono text-ink mt-0.5">{v.shopIds.join(', ') || '—'}</div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </section>
  )
}
