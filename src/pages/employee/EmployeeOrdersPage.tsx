import { useEffect, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useUIStore } from '../../store/useUIStore'
import { Icon, Pill, moneyFull } from '../../lib/specui'

type Order = { id: string; delivery_date: string | null; subtotal: number; benefit_applied: number; topup_amount: number; status: string; vendors: { name: string } | null }
type Home = { orders: Order[] }

export default function EmployeeOrdersPage() {
  const { session } = useAuthStore()
  const { lang } = useUIStore()
  const L = (el: string, en: string) => (lang === 'el' ? el : en)
  const [data, setData] = useState<Home | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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

  return (
    <section className="p-8 max-w-[1100px] mx-auto space-y-6">
      <div>
        <h1 className="font-display text-[36px] leading-[44px] font-semibold">{L('Παραγγελίες', 'Orders')}</h1>
        <p className="text-ink-soft mt-2 text-[15px]">{L('Όλες οι παραγγελίες σας και η χρήση της παροχής.', 'All your orders and benefit usage.')}</p>
      </div>

      {error && <div className="rounded-md border border-danger/40 bg-danger/5 px-4 py-3 text-sm text-danger">{error}</div>}
      {loading && !data && <div className="text-ink-soft">{L('Φόρτωση…', 'Loading…')}</div>}
      {data && (data.orders.length === 0 ? (
        <div className="rounded-md border border-dashed border-line bg-surface p-12 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-brand-soft text-brand mb-3"><Icon name="history" /></div>
          <div className="font-display text-[20px] font-semibold">{L('Καμία παραγγελία ακόμη', 'No orders yet')}</div>
          <p className="text-[13px] text-ink-soft mt-1">{L('Όταν παραγγείλετε από συνεργαζόμενο κατάστημα, θα εμφανιστεί εδώ.', 'When you order from a partner vendor, it will appear here.')}</p>
        </div>
      ) : (
        <div className="bg-surface border border-line rounded-md shadow-sm overflow-hidden">
          <table className="w-full text-[14px]">
            <thead className="bg-bg/40 border-b border-line">
              <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-ink-faint font-semibold">
                <th className="px-5 py-3">{L('Ημ/νία', 'Date')}</th>
                <th className="px-5 py-3">{L('Συνεργάτης', 'Vendor')}</th>
                <th className="px-5 py-3">{L('Κατάσταση', 'Status')}</th>
                <th className="px-5 py-3 text-right">{L('Σύνολο', 'Total')}</th>
                <th className="px-5 py-3 text-right">{L('Παροχή', 'Benefit')}</th>
                <th className="px-5 py-3 text-right">{L('Πληρώσατε', 'You paid')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {data.orders.map((o) => {
                const paid = Math.max(0, o.subtotal - o.benefit_applied)
                const tone = o.status === 'cancelled' ? 'danger' : o.status === 'pending' || o.status === 'confirmed' ? 'accent' : 'success'
                return (
                  <tr key={o.id} className="hover:bg-brand-soft/20">
                    <td className="px-5 py-3 font-mono text-[12.5px]">{o.delivery_date ?? '—'}</td>
                    <td className="px-5 py-3 truncate">{o.vendors?.name ?? '—'}</td>
                    <td className="px-5 py-3"><Pill tone={tone}>{o.status}</Pill></td>
                    <td className="px-5 py-3 text-right num">{moneyFull(o.subtotal, lang)}</td>
                    <td className="px-5 py-3 text-right num text-brand">−{moneyFull(o.benefit_applied, lang)}</td>
                    <td className="px-5 py-3 text-right num text-ink-soft">{paid > 0 ? moneyFull(paid, lang) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  )
}
