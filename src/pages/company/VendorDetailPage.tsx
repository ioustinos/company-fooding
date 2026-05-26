import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'
import { useUIStore } from '../../store/useUIStore'
import { Icon, KPI, Pill, moneyFull } from '../../lib/specui'

type Vendor = { id: string; name: string; legal_name: string | null; discount_percentage: number; discount_applies_to: string; tags: string[] | null }
type Window = { delivery_time_from: string; delivery_time_to: string }
type Shop = { gonnaorder_shop_id: string }
type Agreement = {
  id: string; status: string; sticker_mode: string; reusable_containers: string
  start_date: string; end_date: string | null
  vendors: Vendor | null
  agreement_offices: Window[] | null
  agreement_shops: Shop[] | null
}
type Order = { id: string; delivery_date: string | null; subtotal: number; benefit_applied: number; topup_amount: number; employees: { display_name: string | null; external_ref: string | null } | null }
type TopEmp = { name: string; orders: number; gross: number }

export default function VendorDetailPage() {
  const { id } = useParams()
  const { session } = useAuthStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const token = session?.access_token

  const [agreement, setAgreement] = useState<Agreement | null>(null)
  const [totals, setTotals] = useState<{ orders: number; gross: number; benefit: number; employees: number } | null>(null)
  const [topEmployees, setTopEmployees] = useState<TopEmp[]>([])
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!token || !id) return
    setLoading(true); setError(null)
    ;(async () => {
      try {
        const r = await fetch(`/api/cf-vendors?id=${id}`, { headers: { authorization: `Bearer ${token}` } })
        if (!r.ok) { const b = await r.json().catch(() => ({})); throw new Error(b.error || `HTTP ${r.status}`) }
        const d = await r.json()
        setAgreement(d.agreement); setTotals(d.totals); setTopEmployees(d.topEmployees ?? []); setOrders(d.orders ?? [])
      } catch (e) { setError(e instanceof Error ? e.message : 'Failed to load') }
      finally { setLoading(false) }
    })()
  }, [token, id])

  if (loading) return <section className="p-8 text-ink-soft">{L('Φόρτωση…', 'Loading…')}</section>
  if (error) return <section className="p-8"><div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div></section>
  if (!agreement) return <section className="p-8 text-ink-faint">{L('Δεν βρέθηκε', 'Not found')}</section>

  const v = agreement.vendors
  const windows = (agreement.agreement_offices ?? []).map((w) => `${w.delivery_time_from.slice(0, 5)}–${w.delivery_time_to.slice(0, 5)}`).join(', ')
  const shops = (agreement.agreement_shops ?? []).map((s) => s.gonnaorder_shop_id).join(', ')

  return (
    <section className="p-8 space-y-6 max-w-[1100px]">
      <Link to="/company/vendors" className="inline-flex items-center gap-1.5 text-[13px] text-ink-soft hover:text-ink">
        <span className="rotate-180"><Icon name="chevron_r" /></span>{L('Συνεργάτες', 'Vendors')}
      </Link>

      <div className="flex items-start justify-between gap-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded bg-accent-soft text-accent flex items-center justify-center shrink-0"><Icon name="shop" size={28} /></div>
          <div>
            <h1 className="font-display text-[32px] leading-[40px] font-semibold">{v?.name ?? '—'}</h1>
            {v?.legal_name && <div className="text-[12.5px] text-ink-faint mt-0.5">{v.legal_name}</div>}
            <div className="mt-2 flex items-center gap-2">
              <Pill tone={agreement.status === 'active' ? 'success' : 'neutral'}>{agreement.status}</Pill>
              {(v?.tags ?? []).map((t) => (
                <span key={t} className="inline-flex items-center px-2 py-0.5 rounded-xs text-[10.5px] font-semibold uppercase tracking-[0.08em] bg-bg border border-line text-ink-soft">{t}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {totals && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KPI label={L('Παραγγελίες (90 ημ)', 'Orders (90d)')} value={totals.orders} tone="warn" icon="shop" />
          <KPI label={L('Δαπάνη (90 ημ)', 'Spend (90d)')} value={moneyFull(totals.gross, lang)} tone="accent" icon="wallet" />
          <KPI label={L('Παροχή', 'Benefit')} value={moneyFull(totals.benefit, lang)} tone="success" icon="chart"
            sub={totals.gross > 0 ? `${Math.round(totals.benefit / totals.gross * 100)}%` : '0%'} />
          <KPI label={L('Ενεργοί χρήστες', 'Active users')} value={totals.employees} tone="brand" icon="users" />
        </div>
      )}

      <div className="grid lg:grid-cols-[2fr_1fr] gap-4">
        <div className="bg-surface border border-line rounded-md shadow-sm">
          <div className="p-4 border-b border-line"><h2 className="font-display text-[18px] font-semibold">{L('Στοιχεία συμφωνίας', 'Agreement details')}</h2></div>
          <dl className="p-4 grid grid-cols-2 gap-y-3 gap-x-6 text-[13px]">
            <dt className="text-ink-faint uppercase tracking-[0.06em] text-[10.5px] font-semibold">{L('Έκπτωση', 'Discount')}</dt>
            <dd className="text-right text-ink num">{v?.discount_percentage ?? 0}% · {v?.discount_applies_to === 'benefit_price' ? L('στην παροχή', 'on benefit') : L('στο σύνολο', 'on total')}</dd>

            <dt className="text-ink-faint uppercase tracking-[0.06em] text-[10.5px] font-semibold">{L('Παράδοση', 'Delivery')}</dt>
            <dd className="text-right text-ink num">{windows || '—'}</dd>

            <dt className="text-ink-faint uppercase tracking-[0.06em] text-[10.5px] font-semibold">{L('Ετικέτα', 'Sticker')}</dt>
            <dd className="text-right text-ink">{agreement.sticker_mode === 'employee_name' ? L('όνομα υπαλλήλου', 'employee name') : L('ανώνυμο', 'anonymized')}</dd>

            <dt className="text-ink-faint uppercase tracking-[0.06em] text-[10.5px] font-semibold">{L('Σκεύη', 'Containers')}</dt>
            <dd className="text-right text-ink">{agreement.reusable_containers || '—'}</dd>

            <dt className="text-ink-faint uppercase tracking-[0.06em] text-[10.5px] font-semibold">{L('GO store', 'GO store')}</dt>
            <dd className="text-right font-mono text-ink">{shops || '—'}</dd>

            <dt className="text-ink-faint uppercase tracking-[0.06em] text-[10.5px] font-semibold">{L('Από', 'Since')}</dt>
            <dd className="text-right text-ink font-mono">{agreement.start_date}</dd>
          </dl>
        </div>

        <div className="bg-surface border border-line rounded-md shadow-sm">
          <div className="p-4 border-b border-line"><h2 className="font-display text-[18px] font-semibold">{L('Top παραγγέλνοντες', 'Top orderers')}</h2></div>
          <div className="divide-y divide-line">
            {topEmployees.length === 0 ? (
              <div className="p-4 text-[13px] text-ink-faint">{L('Καμία δραστηριότητα', 'No activity')}</div>
            ) : topEmployees.map((e) => (
              <div key={e.name} className="px-4 py-2.5 flex items-center justify-between">
                <span className="text-[13px] truncate">{e.name}</span>
                <div className="flex items-center gap-3 text-[12px]">
                  <span className="num text-ink-soft">{e.orders}×</span>
                  <span className="num text-ink font-semibold">{moneyFull(e.gross, lang)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-surface border border-line rounded-md shadow-sm">
        <div className="p-4 border-b border-line">
          <h2 className="font-display text-[18px] font-semibold">{L('Πρόσφατες παραγγελίες', 'Recent orders')} <span className="text-ink-faint text-[13px] font-normal">({orders.length})</span></h2>
        </div>
        {orders.length === 0 ? (
          <div className="p-6 text-ink-faint text-center">{L('Καμία παραγγελία στις τελευταίες 90 ημέρες', 'No orders in the last 90 days')}</div>
        ) : (
          <table className="w-full text-[13px]">
            <thead className="bg-bg/40 border-b border-line">
              <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold">
                <th className="px-4 py-2">{L('Ημ/νία', 'Date')}</th>
                <th className="px-4 py-2">{L('Υπάλληλος', 'Employee')}</th>
                <th className="px-4 py-2 text-right">{L('Σύνολο', 'Total')}</th>
                <th className="px-4 py-2 text-right">{L('Παροχή', 'Benefit')}</th>
                <th className="px-4 py-2 text-right">{L('Επιπλέον', 'Extra')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-brand-soft/20">
                  <td className="px-4 py-2 font-mono text-[12px]">{o.delivery_date ?? '—'}</td>
                  <td className="px-4 py-2 truncate">{o.employees?.display_name ?? o.employees?.external_ref ?? '—'}</td>
                  <td className="px-4 py-2 text-right num">{moneyFull(o.subtotal, lang)}</td>
                  <td className="px-4 py-2 text-right num text-brand">{moneyFull(o.benefit_applied, lang)}</td>
                  <td className="px-4 py-2 text-right num text-ink-soft">{o.topup_amount > 0 ? moneyFull(o.topup_amount, lang) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
